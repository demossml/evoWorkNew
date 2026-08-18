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
  findEmployeeByUuid,
  listEmployeesByTenant,
  findUserByEmployee,
  findActiveUserByEmployee,
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
      const role =
        (c.get("role") as string) ||
        (SUPERADMIN_IDS.has(userId) ? "SUPERADMIN" : "CASHIER");
      return c.json({
        authSource: "telegram",
        user: {
          id: userId,
          login: null,
          display_name: "",
          role,
          tenant_id: (c.get("tenantId") as string) || "default",
          shopIds: [],
        },
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
      let employeeName: string | null = null;
      if (u.employee_uuid) {
        const emp = await db
          .prepare("SELECT name FROM employees WHERE uuid = ?")
          .bind(u.employee_uuid)
          .first<{ name: string }>();
        employeeName = emp?.name ?? null;
      }
      enriched.push({ ...u, shopIds, employee_name: employeeName });
    }
    return c.json({ success: true, users: enriched });
  });

  // Сотрудники Evotor для формы выдачи доступа (только синхронизированные)
  app.get("/api/users/evotor-employees", requireSuperAdmin, async (c) => {
    const tenantId = c.get("tenantId");
    const db = c.get("db");
    const emps = await listEmployeesByTenant(db, tenantId);
    const enriched = [];
    for (const e of emps) {
      const acc = await findUserByEmployee(db, tenantId, e.uuid);
      let stores: string[] = [];
      try {
        const parsed = JSON.parse(e.stores || "[]");
        if (Array.isArray(parsed)) stores = parsed.map(String);
      } catch {
        /* невалидный JSON — пусто */
      }
      enriched.push({
        uuid: e.uuid,
        name: e.name,
        last_name: e.last_name ?? "",
        role: e.role ?? "",
        stores,
        has_account: !!acc,
        account_id: acc?.id ?? null,
        account_active: acc ? acc.is_active === 1 : false,
      });
    }
    return c.json({ success: true, employees: enriched });
  });

  app.post("/api/users", requireSuperAdmin, async (c) => {
    const body = await c.req
      .json<{
        employee_uuid?: string;
        role?: string;
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

    // 1) employee_uuid обязателен — доступ выдаём только продавцам из Evotor
    const employeeUuid = (body.employee_uuid || "").trim();
    if (!employeeUuid) {
      return c.json({ success: false, error: "employee_uuid_required" }, 400);
    }

    // 2) Сотрудник должен существовать в employees (текущего tenant)
    const employee = await findEmployeeByUuid(db, tenantId, employeeUuid);
    if (!employee) {
      return c.json({ success: false, error: "employee_not_found" }, 404);
    }

    // 3) Одна активная учётка на сотрудника
    const existing = await findActiveUserByEmployee(db, tenantId, employeeUuid);
    if (existing) {
      return c.json(
        { success: false, error: "account_already_exists", user_id: existing.id },
        409,
      );
    }

    // 4) display_name — из Evotor
    const displayName = employee.name || employeeUuid;

    // 5) shop_ids: явный override — строгая валидация; иначе из employees.stores
    let requested: string[];
    let strict = false;
    if (Array.isArray(body.shop_ids) && body.shop_ids.length > 0) {
      requested = body.shop_ids.map(String);
      strict = true;
    } else {
      try {
        const parsed = JSON.parse(employee.stores || "[]");
        requested = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        requested = [];
      }
    }
    const validShops = await filterTenantShopIds(db, tenantId, requested);
    if (strict && validShops.length !== new Set(requested).size) {
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
      display_name: displayName,
      role,
      employee_uuid: employeeUuid,
    });
    await setUserShops(db, id, validShops);

    return c.json({
      success: true,
      user: {
        id,
        login,
        display_name: displayName,
        role,
        shop_ids: validShops,
        employee_uuid: employeeUuid,
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

    // employee_uuid неизменяем после создания
    if (body.employee_uuid !== undefined && body.employee_uuid !== user.employee_uuid) {
      return c.json({ success: false, error: "employee_uuid_immutable" }, 400);
    }
    // Нельзя отвязать учётку от сотрудника у CASHIER/ADMIN
    const targetRole = body.role ?? user.role;
    if (
      body.employee_uuid === null &&
      (targetRole === "CASHIER" || targetRole === "ADMIN")
    ) {
      return c.json({ success: false, error: "employee_uuid_required" }, 400);
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

  // ─────────────────────────────────────────────────────────────
  // Режим приложения (vape | universal)
  // ─────────────────────────────────────────────────────────────
  app.get("/api/tenant/product-profile", async (c) => {
    const db = c.get("db");
    const tenantId = c.get("tenantId");
    const t = await getTenantById(db, tenantId);
    const profile = t?.product_profile === "universal" ? "universal" : "vape";
    return c.json({
      product_profile: profile,
      label: profile === "universal" ? "Универсальная розница" : "Моя сеть",
    });
  });

  app.put("/api/tenant/product-profile", requireSuperAdmin, async (c) => {
    const body = await c.req
      .json<{ product_profile?: string }>()
      .catch(() => ({}));
    const profile = body.product_profile;
    if (profile !== "vape" && profile !== "universal") {
      return c.json({ success: false, error: "invalid_profile" }, 400);
    }

    const db = c.get("db");
    const tenantId = c.get("tenantId");
    await db
      .prepare(
        `UPDATE tenants SET product_profile = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(profile, tenantId)
      .run();

    return c.json({
      product_profile: profile,
      label: profile === "universal" ? "Универсальная розница" : "Моя сеть",
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Фокус-категория (группы товаров для универсального KPI)
  // ─────────────────────────────────────────────────────────────
  app.get("/api/tenant/focus-category", async (c) => {
    const db = c.get("db");
    const tenantId = c.get("tenantId");
    const t = await getTenantById(db, tenantId);
    const uuids = parseGroupUuids(t?.focus_group_uuids);
    const labels = await groupLabels(db, uuids);
    return c.json({ group_uuids: uuids, labels });
  });

  app.put("/api/tenant/focus-category", requireSuperAdmin, async (c) => {
    const body = await c.req
      .json<{ group_uuids?: unknown }>()
      .catch(() => ({}));
    const arr = Array.isArray(body.group_uuids) ? body.group_uuids : [];
    const uuids = arr
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .map((u) => u.trim())
      .slice(0, 3); // максимум 3 группы

    const db = c.get("db");
    const tenantId = c.get("tenantId");
    await db
      .prepare(
        `UPDATE tenants SET focus_group_uuids = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(JSON.stringify(uuids), tenantId)
      .run();

    const labels = await groupLabels(db, uuids);
    return c.json({ group_uuids: uuids, labels });
  });

  // Продажи фокус-групп за период (минимум для Home-карточки в universal)
  app.get("/api/tenant/focus-category/sales", async (c) => {
    const db = c.get("db");
    const tenantId = c.get("tenantId");
    const since = c.req.query("since") || todayStr();
    const until = c.req.query("until") || since;

    const t = await getTenantById(db, tenantId);
    const uuids = parseGroupUuids(t?.focus_group_uuids);
    if (uuids.length === 0) {
      return c.json({ groups: [], focusRevenue: 0, totalRevenue: 0, sharePct: 0 });
    }

    const labels = await groupLabels(db, uuids);

    const placeholders = uuids.map(() => "?").join(",");
    const productRows = await db
      .prepare(
        `SELECT DISTINCT uuid FROM shopProduct WHERE parentUuid IN (${placeholders}) AND product_group = 0`,
      )
      .bind(...uuids)
      .all<{ uuid: string }>();
    const focusUuids = new Set((productRows.results ?? []).map((r) => r.uuid));

    // close_date — ISO с временем (2026-08-18T07:48:46.000+0000),
    // поэтому фильтруем диапазон [since 00:00, until+1день 00:00).
    const startTs = `${since}T00:00:00`;
    const endExclusive = addDays(until, 1);

    const docs = await db
      .prepare(
        `SELECT type, transactions FROM index_documents WHERE close_date >= ? AND close_date < ? AND type IN ('SELL','PAYBACK')`,
      )
      .bind(startTs, endExclusive)
      .all<{ type: string; transactions: string }>();

    let focusRevenue = 0;
    let totalRevenue = 0;
    for (const row of docs.results ?? []) {
      const isRefund = row.type === "PAYBACK";
      const sign = isRefund ? -1 : 1;
      let txs: unknown;
      try {
        txs = JSON.parse(row.transactions);
      } catch {
        continue;
      }
      if (!Array.isArray(txs)) continue;
      for (const tx of txs as Array<{ type?: string; sum?: number; quantity?: number; commodityUuid?: string }>) {
        if (tx.type !== "REGISTER_POSITION") continue;
        const sum = Number(tx.sum ?? 0);
        totalRevenue += sum * sign;
        if (tx.commodityUuid && focusUuids.has(tx.commodityUuid)) {
          focusRevenue += sum * sign;
        }
      }
    }

    const sharePct =
      totalRevenue > 0 ? Math.round((focusRevenue / totalRevenue) * 1000) / 10 : 0;

    return c.json({
      groups: labels,
      focusRevenue: Math.round(focusRevenue),
      totalRevenue: Math.round(totalRevenue),
      sharePct,
    });
  });
}

/** Парсит JSON-массив group uuids из колонки tenants.focus_group_uuids. */
function parseGroupUuids(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  } catch {
    return [];
  }
}

/** Имена групп (uuid → name) из shopProduct (product_group = 1). */
async function groupLabels(
  db: IEnv["Bindings"]["DB"],
  uuids: string[],
): Promise<Array<{ uuid: string; name: string }>> {
  if (uuids.length === 0) return [];
  const placeholders = uuids.map(() => "?").join(",");
  const res = await db
    .prepare(
      `SELECT DISTINCT uuid, name FROM shopProduct WHERE product_group = 1 AND uuid IN (${placeholders})`,
    )
    .bind(...uuids)
    .all<{ uuid: string; name: string }>();
  return res.results ?? [];
}

/** Локальная дата YYYY-MM-DD (без сдвига часового пояса). */
function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Прибавляет N дней к дате YYYY-MM-DD (локально). */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d!);
  dt.setDate(dt.getDate() + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
