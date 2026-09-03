import type { Next } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import { Evotor } from "./evotor";
import type { IContext } from "./types";
import { assert, createIndexDocumentsTable, createOpeningPhotosTable, createOpenStorsTable, isValidSign } from "./utils";
import { createSettingsTable } from "./db/repositories/settings";
import { runMigrations } from "./db/migrations";
import { drizzle } from "drizzle-orm/d1";

let tablesInitialized = false;

async function ensureTables(db: D1Database): Promise<void> {
  if (tablesInitialized) return;
  await createIndexDocumentsTable(db);
  await createSettingsTable(db);
  await createOpeningPhotosTable(db);
  await createOpenStorsTable(db);
  await runMigrations(db);
  tablesInitialized = true;
}

export const initializeDrizzle = (c: IContext) => {
	const db = drizzle(c.env.DB); // c.env.DB — это D1Database
	c.set("drizzle", db); // сохраняем в контекст
	return db;
};

export const initialize = async (c: IContext, next: Next) => {
  c.set("evotor", new Evotor(c.env.EVOTOR_API_TOKEN));
  c.set("db", c.env.DB);
  c.set("drizzle", drizzle(c.env.DB));
  c.set("ai", c.env.AI);
  c.set("r2", c.env.R2);
  c.set("r2Url", c.env.R2_PUBLIC_URL);
  c.set("BOT_TOKEN", c.env.BOT_TOKEN);

  await ensureTables(c.env.DB);

  // Гарантируем наличие дефолтного тенанта (токен из env) —
  // чтобы универсальный движок мог работать сразу после старта.
  try {
    const { ensureDefaultTenant } = await import("./sync/syncEngine");
    await ensureDefaultTenant(c.env.DB, c.env.EVOTOR_API_TOKEN);
  } catch (e: any) {
    console.warn("[initialize] ensureDefaultTenant:", e?.message ?? e);
  }

  return next();
};

/**
 * authenticate — dual-mode:
 *   1) Bearer-сессия (app_sessions) — приоритет;
 *   2) Legacy Telegram (initData / telegram-id) — как раньше.
 * Источник истины tenant/shopIds/role — сессия, а не body/query клиента.
 */
export const authenticate = async (c: IContext, next: Next) => {
  const db = c.env.DB;
  // Defaults
  c.set("tenantId", "default");
  c.set("role", "");
  c.set("shopIds", []);
  c.set("authSource", "guest");
  c.set("appUserId", undefined);

  // 1) Bearer session
  const authHeader = c.req.header("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const sessionFromHeader = bearer || c.req.header("X-Session-Id") || "";

  if (sessionFromHeader) {
    const { getSession, findUserById, getUserShopIds, getTenantById } = await import(
      "./modules/auth/repo"
    );
    const session = await getSession(db, sessionFromHeader);
    if (session && session.expires_at >= new Date().toISOString()) {
      const user = await findUserById(db, session.user_id);
      if (user && user.is_active === 1 && user.tenant_id === session.tenant_id) {
        const shopIds =
          user.role === "SUPERADMIN" ? [] : await getUserShopIds(db, user.id);
        const tenant = await getTenantById(db, user.tenant_id);

        c.set("appUserId", user.id);
        c.set("userId", user.id);
        c.set("tenantId", user.tenant_id);
        c.set("role", user.role);
        c.set("shopIds", shopIds);
        c.set("authSource", "session");
        c.set("user", {
          id: user.id,
          first_name: user.display_name,
          last_name: "",
          username: user.login,
          photo_url: "",
        });

        // Evotor из токена ТЕНАНТА (не из env)
        if (tenant?.evotor_token) {
          c.set("evotor", new Evotor(tenant.evotor_token));
        }

        return next();
      }
    }
    // невалидная сессия — падаем в telegram/guest
  }

  // 2) Legacy Telegram (как было)
  const initData = c.req.header("initData") || "guest";

  if (initData === "guest") {
    const manualId = c.req.header("telegram-id");
    if (manualId) {
      c.set("user", {
        id: manualId,
        first_name: "",
        last_name: "",
        username: "",
        photo_url: "",
      });
      c.set("userId", manualId);
      c.set("authSource", "telegram");
    } else {
      c.set("user", {
        id: "",
        first_name: "",
        last_name: "",
        username: "",
        photo_url: "",
      });
      c.set("userId", "");
      c.set("authSource", "guest");
    }
  } else {
    const payload = Object.fromEntries(new URLSearchParams(initData));
    const isValid = await isValidSign(c.env.BOT_TOKEN, payload);
    assert(isValid, "invalid signature");
    const user = JSON.parse(payload.user);
    c.set("user", user);
    c.set("userId", user.id.toString());
    c.set("authSource", "telegram");
  }

  // Legacy Telegram: роль сразу (нужна /api/auth/me, UsersAccessCard, requireAdmin)
  if (c.get("authSource") === "telegram") {
    const uid = c.get("userId") as string;
    if (SUPERADMIN_IDS.has(uid)) {
      c.set("role", "SUPERADMIN");
    } else {
      try {
        const r = await getEmployeeRoleFromDBSimple(c.env.DB, uid);
        if (r && r !== "null") c.set("role", r);
      } catch {
        /* ignore */
      }
    }
  }

  return next();
};

// SUPERADMIN Telegram IDs (legacy, hardcoded)
export const SUPERADMIN_IDS = new Set(["5700958253", "475039971"]);

/**
 * requireAdmin — middleware, проверяющий права Admin/SuperAdmin.
 * Must be placed AFTER authenticate and initialize in the middleware chain.
 */
export const requireAdmin = async (c: IContext, next: Next) => {
  const role = (c.get("role") as string) || "";
  const userId = c.get("userId") as string;
  const authSource = c.get("authSource") as string;

  if (role === "SUPERADMIN" || role === "ADMIN") {
    return next();
  }

  // legacy telegram hardcoded
  if (authSource === "telegram" && SUPERADMIN_IDS.has(userId)) {
    c.set("role", "SUPERADMIN");
    return next();
  }

  // legacy DB role by telegram id / last_name
  if (authSource === "telegram") {
    try {
      const db = c.get("db") as D1Database;
      const r = await getEmployeeRoleFromDBSimple(db, userId);
      if (r === "ADMIN" || r === "SUPERADMIN") {
        c.set("role", r);
        return next();
      }
    } catch {
      /* fallthrough */
    }
  }

  return c.json(
    {
      success: false,
      message: "Forbidden: требуется роль Admin или SuperAdmin",
    },
    403,
  );
};

/** Только SUPERADMIN (для управления пользователями и токеном) */
export const requireSuperAdmin = async (c: IContext, next: Next) => {
  const role = (c.get("role") as string) || "";
  const userId = c.get("userId") as string;
  const authSource = c.get("authSource") as string;

  if (role === "SUPERADMIN") return next();
  if (authSource === "telegram" && SUPERADMIN_IDS.has(userId)) {
    c.set("role", "SUPERADMIN");
    return next();
  }
  return c.json({ success: false, message: "Forbidden: только SUPERADMIN" }, 403);
};

/**
 * isPlatformOwner — владелец платформы (имеет право менять платформенные
 * настройки, например product_profile vape/universal). Достаточно ЛЮБОГО:
 *   1) tenantId === "default" — основная сеть владельца;
 *   2) userId ∈ env.PLATFORM_OWNER_IDS (comma-separated; telegram id или app user id);
 *   3) tenant.evotor_token === env.EVOTOR_API_TOKEN (осторожно: только если
 *      токен один на владельца).
 * Предпочтение: (1) + (2) — явный список в secret/env.
 */
export async function isPlatformOwner(c: IContext): Promise<boolean> {
  const tenantId = (c.get("tenantId") as string) || "default";
  if (tenantId === "default") return true;

  const userId = (c.get("userId") as string) || "";
  const rawIds = (c.env.PLATFORM_OWNER_IDS || "").trim();
  if (rawIds) {
    const ids = new Set(rawIds.split(",").map((s) => s.trim()).filter(Boolean));
    if (userId && ids.has(userId)) return true;
  }

  const envToken = (c.env.EVOTOR_API_TOKEN || "").trim();
  if (envToken) {
    try {
      const { getTenantById } = await import("./modules/auth/repo");
      const tenant = await getTenantById(c.env.DB, tenantId);
      if (tenant?.evotor_token && tenant.evotor_token === envToken) return true;
    } catch {
      /* ignore — fallthrough к false */
    }
  }

  return false;
}

/** Только platform owner (например, для PUT /api/tenant/product-profile). */
export const requirePlatformOwner = async (c: IContext, next: Next) => {
  const authSource = c.get("authSource") as string;
  if (authSource === "guest") return c.json({ error: "forbidden" }, 403);
  if (await isPlatformOwner(c)) return next();
  return c.json({ error: "forbidden" }, 403);
};

/**
 * Проверка доступа к магазину.
 * Вызывать внутри handler: assertShopAccess(c, shopId).
 * SUPERADMIN проходит всегда (tenant filter отдельно).
 */
export function assertShopAccess(c: IContext, shopId: string): void {
  const role = c.get("role") as string;
  const shopIds = (c.get("shopIds") as string[]) || [];
  if (role === "SUPERADMIN") return; // все магазины своего tenant
  if (!shopId || !shopIds.includes(shopId)) {
    throw new Error("FORBIDDEN_SHOP"); // error-handler → 403
  }
}

/** Lightweight version — doesn't require import from sync/db */
async function getEmployeeRoleFromDBSimple(
	db: D1Database,
	userId: string,
): Promise<string | null> {
	const res = await db
		.prepare("SELECT role FROM employees WHERE uuid = ? OR last_name = ?")
		.bind(userId, userId)
		.first<{ role: string }>();
	return res?.role ?? null;
}

/**
 * UUID магазинов текущего tenant (по shops.tenant_id).
 * Пустой список = у tenant нет магазинов → caller должен вернуть пустой ответ,
 * а не «все данные».
 */
export async function getTenantShopUuids(
	db: D1Database,
	tenantId: string,
): Promise<string[]> {
	const rows = await db
		.prepare("SELECT uuid FROM shops WHERE tenant_id = ?")
		.bind(tenantId || "default")
		.all<{ uuid: string }>();
	return (rows.results ?? []).map((r) => r.uuid);
}

/**
 * Строит SQL-фрагмент `IN (?, ?, ...)` для shop scoping.
 * Если список пуст — возвращает "('__no_shops__')", чтобы запрос дал 0 строк.
 */
export function shopInClause(shopUuids: string[]): string {
	if (shopUuids.length === 0) return "('__no_shops__')";
	return `(${shopUuids.map(() => "?").join(",")})`;
}
