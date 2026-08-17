/**
 * routes.ts — auth + users + tenant routes.
 * Подключается к главному Hono-приложению через registerAuthRoutes(api).
 */

import { Hono } from "hono";
import type { IEnv } from "../../types";
import { requireSuperAdmin, SUPERADMIN_IDS } from "../../helpers";
import {
  upsertTenant,
  getTenantById,
  findTenantByToken,
  findSuperAdminByTenant,
  findUserByLogin,
  findUserById,
  listUsersByTenant,
  insertUser,
  updateUserPassword,
  updateUserLogin,
  updateUserMeta,
  setUserShops,
  getUserShopIds,
  filterTenantShopIds,
  touchLastLogin,
  createSession,
  deleteSession,
  deleteUserSessions,
} from "./repo";
import {
  hashPassword,
  verifyPassword,
  generateLogin,
  generatePassword,
  newId,
} from "./password";
import { Evotor } from "../../evotor";

function authSecret(c: { env: IEnv["Bindings"] }): string {
  const secret = c.env.AUTH_SECRET || c.env.BOT_TOKEN || "";
  if (!secret) {
    console.warn("[auth] AUTH_SECRET не задан — используем dev-fallback");
    return "dev-auth-secret-change-me";
  }
  return secret;
}

/** Уникальный login с повторными попытками. */
async function makeUniqueLogin(
  db: IEnv["Bindings"]["DB"],
  prefix: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const login = generateLogin(prefix);
    const existing = await findUserByLogin(db, login);
    if (!existing) return login;
  }
  // Фолбэк с длинным случайным суффиксом
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function registerAuthRoutes(app: Hono<IEnv>) {
  // ─────────────────────────────────────────────────────────────
  // Bootstrap владельца: подключение Evotor-токена → tenant + SUPERADMIN
  // ─────────────────────────────────────────────────────────────
  app.post("/api/auth/connect-token", async (c) => {
    const body = await c.req.json<{ token?: string; name?: string }>().catch(() => ({}));
    const token = (body.token || "").trim();
    if (!token) {
      return c.json({ success: false, error: "empty_token" }, 400);
    }

    // Проверяем токен через Evotor API
    try {
      const evo = new Evotor(token);
      await evo.getShops();
    } catch (e: any) {
      console.warn("[auth] connect-token: invalid token:", e?.message);
      return c.json({ success: false, error: "invalid_token" }, 400);
    }

    const db = c.get("db");
    const secret = authSecret(c);

    // Находим существующий tenant по токену или создаём новый
    let tenantId: string;
    const existing = await findTenantByToken(db, token);
    if (existing) {
      tenantId = existing.id;
    } else if (token === c.env.EVOTOR_API_TOKEN) {
      const def = await getTenantById(db, "default");
      tenantId = def ? "default" : newId();
    } else {
      tenantId = newId();
    }

    await upsertTenant(db, tenantId, body.name || "Моя сеть", token);

    // SUPERADMIN этого tenant
    let owner = await findSuperAdminByTenant(db, tenantId);
    let generatedPassword: string | null = null;

    if (!owner) {
      const login = await makeUniqueLogin(db, "owner");
      const password = generatePassword();
      const hash = await hashPassword(password, secret);
      const id = newId();
      await insertUser(db, {
        id,
        tenant_id: tenantId,
        login,
        password_hash: hash,
        display_name: "Владелец",
        role: "SUPERADMIN",
        employee_uuid: null,
      });
      owner = await findUserById(db, id);
      generatedPassword = password; // единственный раз
    }

    if (!owner) {
      return c.json({ success: false, error: "owner_create_failed" }, 500);
    }

    const ua = c.req.header("user-agent") || "";
    const session = await createSession(db, owner.id, tenantId, ua);
    await touchLastLogin(db, owner.id);

    return c.json({
      success: true,
      tenantId,
      sessionId: session.id,
      user: {
        id: owner.id,
        login: owner.login,
        display_name: owner.display_name,
        role: owner.role,
      },
      ...(generatedPassword ? { generatedPassword } : {}),
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Login / Logout / Me
  // ─────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (c) => {
    const body = await c.req
      .json<{ login?: string; password?: string }>()
      .catch(() => ({}));
    const login = (body.login || "").trim();
    const password = body.password || "";
    if (!login || !password) {
      return c.json({ success: false, error: "invalid_credentials" }, 401);
    }
    const db = c.get("db");
    const secret = authSecret(c);
    const user = await findUserByLogin(db, login);
    if (!user || user.is_active !== 1) {
      return c.json({ success: false, error: "invalid_credentials" }, 401);
    }
    const ok = await verifyPassword(password, user.password_hash, secret);
    if (!ok) {
      return c.json({ success: false, error: "invalid_credentials" }, 401);
    }
    await touchLastLogin(db, user.id);
    const ua = c.req.header("user-agent") || "";
    const session = await createSession(db, user.id, user.tenant_id, ua);
    const shopIds =
      user.role === "SUPERADMIN" ? [] : await getUserShopIds(db, user.id);
    return c.json({
      success: true,
      sessionId: session.id,
      user: {
        id: user.id,
        login: user.login,
        display_name: user.display_name,
        role: user.role,
        tenant_id: user.tenant_id,
        shopIds,
        must_change_password: !!user.must_change_password,
      },
    });
  });

  app.post("/api/auth/logout", async (c) => {
    const authHeader = c.req.header("Authorization") || "";
    const sessionId = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (sessionId) {
      await deleteSession(c.get("db"), sessionId);
    }
    return c.json({ success: true });
  });

  app.get("/api/auth/me", async (c) => {
    const authSource = c.get("authSource");
    const db = c.get("db");

    if (authSource === "session") {
      const appUserId = c.get("appUserId");
      const user = appUserId ? await findUserById(db, appUserId) : null;
      if (!user) {
        return c.json({ success: false, error: "session_user_not_found" }, 401);
      }
      const shopIds =
        user.role === "SUPERADMIN" ? [] : await getUserShopIds(db, user.id);
      return c.json({
        authSource: "session",
        user: {
          id: user.id,
          login: user.login,
          display_name: user.display_name,
          role: user.role,
          tenant_id: user.tenant_id,
          shopIds,
          employee_uuid: user.employee_uuid,
        },
      });
    }

    if (authSource === "telegram") {
      const userId = c.get("userId");
      const role = c.get("role") || (SUPERADMIN_IDS.has(userId) ? "SUPERADMIN" : null);
      return c.json({
        authSource: "telegram",
        user: { id: userId, role },
      });
    }

    return c.json({ success: false, error: "unauthorized" }, 401);
  });

  // ─────────────────────────────────────────────────────────────
  // Users CRUD (только SUPERADMIN)
  // ─────────────────────────────────────────────────────────────
  app.get("/api/users", requireSuperAdmin, async (c) => {
    const tenantId = c.get("tenantId");
    const db = c.get("db");
    const users = await listUsersByTenant(db, tenantId);
    const enriched = [];
    for (const u of users) {
      const shopIds = u.role === "SUPERADMIN" ? [] : await getUserShopIds(db, u.id);
      enriched.push({ ...u, shopIds });
    }
    return c.json({ success: true, users: enriched });
  });

  app.post("/api/users", requireSuperAdmin, async (c) => {
    const body = await c.req
      .json<{
        display_name?: string;
        role?: string;
        employee_uuid?: string | null;
        shop_ids?: string[];
      }>()
      .catch(() => ({}));
    const db = c.get("db");
    const tenantId = c.get("tenantId");
    const secret = authSecret(c);

    const role = body.role || "CASHIER";
    if (role !== "CASHIER" && role !== "ADMIN") {
      return c.json({ success: false, error: "invalid_role" }, 400);
    }

    // shop_ids должны принадлежать текущему tenant
    const requestedShops = Array.isArray(body.shop_ids) ? body.shop_ids : [];
    const validShops = await filterTenantShopIds(db, tenantId, requestedShops);
    if (validShops.length !== new Set(requestedShops).size) {
      return c.json({ success: false, error: "invalid_shop" }, 400);
    }

    const login = await makeUniqueLogin(db, "seller");
    const password = generatePassword();
    const hash = await hashPassword(password, secret);
    const id = newId();

    await insertUser(db, {
      id,
      tenant_id: tenantId,
      login,
      password_hash: hash,
      display_name: body.display_name || login,
      role,
      employee_uuid: body.employee_uuid ?? null,
    });
    await setUserShops(db, id, validShops);

    return c.json({
      success: true,
      user: {
        id,
        login,
        display_name: body.display_name || login,
        role,
        shop_ids: validShops,
        employee_uuid: body.employee_uuid ?? null,
      },
      // plaintext пароль — единственный раз
      password,
    });
  });

  app.patch("/api/users/:id", requireSuperAdmin, async (c) => {
    const userId = c.req.param("id");
    const db = c.get("db");
    const tenantId = c.get("tenantId");

    const user = await findUserById(db, userId);
    if (!user || user.tenant_id !== tenantId) {
      // 404, чтобы не раскрывать существование чужого пользователя
      return c.json({ success: false, error: "not_found" }, 404);
    }

    const body = await c.req
      .json<{
        display_name?: string;
        role?: string;
        employee_uuid?: string | null;
        shop_ids?: string[];
        is_active?: number;
      }>()
      .catch(() => ({}));

    if (body.role !== undefined) {
      if (body.role !== "CASHIER" && body.role !== "ADMIN") {
        return c.json({ success: false, error: "invalid_role" }, 400);
      }
    }

    if (body.shop_ids !== undefined) {
      const requested = Array.isArray(body.shop_ids) ? body.shop_ids : [];
      const valid = await filterTenantShopIds(db, tenantId, requested);
      if (valid.length !== new Set(requested).size) {
        return c.json({ success: false, error: "invalid_shop" }, 400);
      }
      await setUserShops(db, userId, valid);
    }

    await updateUserMeta(db, userId, {
      display_name: body.display_name,
      role: body.role,
      employee_uuid: body.employee_uuid,
      is_active: body.is_active,
    });

    const updated = await findUserById(db, userId);
    const shopIds = await getUserShopIds(db, userId);
    return c.json({
      success: true,
      user: {
        id: userId,
        login: updated?.login ?? "",
        display_name: updated?.display_name ?? "",
        role: updated?.role ?? "",
        shopIds,
        employee_uuid: updated?.employee_uuid ?? null,
        is_active: updated?.is_active ?? 1,
      },
    });
  });

  app.post("/api/users/:id/regenerate-password", requireSuperAdmin, async (c) => {
    const userId = c.req.param("id");
    const db = c.get("db");
    const tenantId = c.get("tenantId");

    const user = await findUserById(db, userId);
    if (!user || user.tenant_id !== tenantId) {
      return c.json({ success: false, error: "not_found" }, 404);
    }

    const password = generatePassword();
    const hash = await hashPassword(password, authSecret(c));
    await updateUserPassword(db, userId, hash);
    await deleteUserSessions(db, userId); // старые сессии мертвы

    return c.json({ success: true, password });
  });

  app.post("/api/users/:id/regenerate-login", requireSuperAdmin, async (c) => {
    const userId = c.req.param("id");
    const db = c.get("db");
    const tenantId = c.get("tenantId");

    const user = await findUserById(db, userId);
    if (!user || user.tenant_id !== tenantId) {
      return c.json({ success: false, error: "not_found" }, 404);
    }

    const login = await makeUniqueLogin(db, user.role === "SUPERADMIN" ? "owner" : "seller");
    await updateUserLogin(db, userId, login);
    await deleteUserSessions(db, userId);

    return c.json({ success: true, login });
  });

  app.post("/api/users/:id/deactivate", requireSuperAdmin, async (c) => {
    const userId = c.req.param("id");
    const db = c.get("db");
    const tenantId = c.get("tenantId");
    const currentUserId = c.get("appUserId");

    const user = await findUserById(db, userId);
    if (!user || user.tenant_id !== tenantId) {
      return c.json({ success: false, error: "not_found" }, 404);
    }
    if (currentUserId && currentUserId === userId) {
      return c.json({ success: false, error: "cannot_deactivate_self" }, 400);
    }

    await updateUserMeta(db, userId, { is_active: 0 });
    await deleteUserSessions(db, userId);

    return c.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────────
  // Магазины текущего tenant
  // ─────────────────────────────────────────────────────────────
  app.get("/api/tenant/shops", async (c) => {
    const tenantId = c.get("tenantId");
    const db = c.get("db");
    const res = await db
      .prepare(`SELECT uuid, name FROM shops WHERE tenant_id = ? ORDER BY name`)
      .bind(tenantId)
      .all<{ uuid: string; name: string }>();
    return c.json({ success: true, shops: res.results ?? [] });
  });
}
