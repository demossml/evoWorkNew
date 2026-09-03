import type { Next } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import { Evotor } from "./evotor";
import type { IContext } from "./types";
import { createIndexDocumentsTable, createOpeningPhotosTable, createOpenStorsTable, isValidSign } from "./utils";
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
 * Public (безавторизационные) маршруты — явный whitelist.
 * Всё остальное без валидной auth → 401 (fail-closed), tenantId НЕ default.
 */
const PUBLIC_ROUTES: { method: string; path: string }[] = [
	{ method: "GET", path: "/health" },
	{ method: "POST", path: "/api/auth/login" },
	{ method: "POST", path: "/api/auth/connect-token" },
];

function isPublicRoute(method: string, path: string): boolean {
	// Статика/фронтенд (PWA: index.html, manifest, assets, /reports/:key HTML-отчёты) — публично.
	if (!path.startsWith("/api/")) return true;
	// Публичные share-ссылки на картинки отчётов из R2.
	if (method === "GET" && path.startsWith("/api/evotor/share-report/")) return true;
	return PUBLIC_ROUTES.some((r) => r.method === method && r.path === path);
}

let publicRoutesLogged = false;

/**
 * authenticate — fail-closed:
 *   1) Public whitelist (health, login, connect-token, статика, share-ссылки);
 *   2) Bearer-сессия (app_sessions) — tenantId/role/shopIds из user record;
 *   3) Legacy Telegram (initData / telegram-id) — только ваша сеть (tenant default);
 *   4) Всё остальное (гость) → 401, tenantId не default.
 * Источник истины tenant/shopIds/role — сессия, а не body/query клиента.
 */
export const authenticate = async (c: IContext, next: Next) => {
  const db = c.env.DB;
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;

  // Fail-closed defaults: гость НЕ привязан к default tenant.
  c.set("tenantId", "");
  c.set("role", "");
  c.set("shopIds", []);
  c.set("authSource", "guest");
  c.set("appUserId", undefined);

  // Логируем публичный список один раз (dev).
  if (!publicRoutesLogged) {
    publicRoutesLogged = true;
    if (typeof process === "undefined" || process.env?.NODE_ENV !== "production") {
      console.log(
        "[auth] public routes:",
        PUBLIC_ROUTES.map((r) => `${r.method} ${r.path}`).join(", "),
        "+ статика (non-/api) + GET /api/evotor/share-report/*",
      );
    }
  }

  // 1) Public whitelist — пропускаем без auth.
  if (isPublicRoute(method, path)) {
    return next();
  }

  // 2) Bearer session
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
    // Невалидная сессия — fail-closed (НЕ падаем в telegram/guest).
  } else {
    // 3) Legacy Telegram (initData / telegram-id) — только ваша сеть (default tenant)
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
        c.set("tenantId", "default");
        c.set("authSource", "telegram");
      }
    } else {
      const payload = Object.fromEntries(new URLSearchParams(initData));
      const isValid = await isValidSign(c.env.BOT_TOKEN, payload);
      if (isValid) {
        const user = JSON.parse(payload.user);
        c.set("user", user);
        c.set("userId", user.id.toString());
        c.set("tenantId", "default");
        c.set("authSource", "telegram");
      }
      // невалидная подпись → гость → 401 ниже
    }
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
    return next();
  }

  // 4) Гость — fail-closed: 401, tenantId не default.
  return c.json({ error: "unauthorized" }, 401);
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
