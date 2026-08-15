import type { D1Database } from "@cloudflare/workers-types";
import { Evotor } from "../evotor";
import {
  formatDateWithTime,
  createIndexDocumentsTable,
  saveNewIndexDocuments,
} from "../utils";
import {
  createProductsTableIfNotExists,
  createShopProductTable,
  updateOrInsertData,
  updateOrInsertDataS,
  createShopsTable,
  upsertShops,
  createEmployeesTable,
  upsertEmployees,
  delay,
  getShopUuidsFromDB,
} from "./db";
import { getNumberSetting } from "../services/settingsService";
import { runMigrations } from "../db/migrations";

// ============================================================================
// Универсальный движок синхронизации Эвотор для нескольких клиентов (тенантов)
//
// Каждый тенант = отдельный аккаунт Эвотор со своим токеном.
// syncTenant(tenantId) тянет ВСЕ данные: магазины, сотрудников, терминалы,
// товары, остатки и ВСЕ типы документов (18 типов, включая инвентаризации,
// переоценки, списания, X/Z-отчёты и т.д.).
//
// Прогресс хранится в sync_state (tenant_id, store_id, resource):
//   - last_success_at — когда ресурс последний раз успешно синхронизирован
//   - status/error — статус последнего прогона
// Интервалы синхронизации per-resource читаются из настроек БД:
//   sync_interval_documents (мин, default 5)
//   sync_interval_stock     (мин, default 30)
//   sync_interval_products  (мин, default 60)
//   sync_interval_meta      (мин, default 20) — shops/employees/devices
//   sync_backfill_days      (дней, default 90) — первичная загрузка документов
// ============================================================================

export interface TenantRow {
  id: string;
  name: string;
  evotor_token: string;
  status: string;
}

export interface SyncStateRow {
  tenant_id: string;
  store_id: string;
  resource: string;
  last_success_at: string | null;
  status: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Таблицы
// ---------------------------------------------------------------------------

export async function createTenantsTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      evotor_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  try {
    await db.prepare(`ALTER TABLE tenants ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`).run();
  } catch { /* уже есть */ }
}

export async function createSyncStateTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sync_state (
      tenant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      last_success_at TEXT,
      last_cursor TEXT,
      last_close_date TEXT,
      status TEXT DEFAULT 'idle',
      error TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tenant_id, store_id, resource)
    )
  `).run();
  try { await db.prepare(`ALTER TABLE sync_state ADD COLUMN last_cursor TEXT`).run(); } catch { /* уже есть */ }
  try { await db.prepare(`ALTER TABLE sync_state ADD COLUMN last_close_date TEXT`).run(); } catch { /* уже есть */ }
}

export async function createDevicesTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      imei TEXT,
      store_id TEXT NOT NULL,
      user_id TEXT,
      model TEXT,
      timezone_offset INTEGER DEFAULT 0,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  try { await db.prepare(`ALTER TABLE devices ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`).run(); } catch { /* уже есть */ }
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_devices_store_id ON devices (store_id)
  `).run();
}

// ---------------------------------------------------------------------------
// Тенанты
// ---------------------------------------------------------------------------

/** Гарантирует наличие дефолтного тенанта (текущий аккаунт из env). */
export async function ensureDefaultTenant(
  db: D1Database,
  token: string,
  name = "default",
): Promise<void> {
  await createTenantsTable(db);
  await db.prepare(`
    INSERT INTO tenants (id, name, evotor_token, status)
    VALUES ('default', ?, ?, 'active')
    ON CONFLICT(id) DO UPDATE SET
      evotor_token = excluded.evotor_token,
      name = excluded.name,
      updated_at = datetime('now')
  `).bind(name, token).run();
}

export async function getActiveTenants(db: D1Database): Promise<TenantRow[]> {
  const res = await db
    .prepare(`SELECT id, name, evotor_token, status FROM tenants WHERE status = 'active'`)
    .all<TenantRow>();
  return res.results ?? [];
}

// ---------------------------------------------------------------------------
// sync_state
// ---------------------------------------------------------------------------

export async function getSyncState(
  db: D1Database,
  tenantId: string,
  storeId: string,
  resource: string,
): Promise<SyncStateRow | null> {
  const res = await db
    .prepare(
      `SELECT tenant_id, store_id, resource, last_success_at, status, error
       FROM sync_state WHERE tenant_id = ? AND store_id = ? AND resource = ?`,
    )
    .bind(tenantId, storeId, resource)
    .first<SyncStateRow>();
  return res ?? null;
}

export async function setSyncState(
  db: D1Database,
  tenantId: string,
  storeId: string,
  resource: string,
  state: {
    lastSuccessAt?: string | null;
    lastCloseDate?: string | null;
    status?: string | null;
    error?: string | null;
  },
): Promise<void> {
  await db.prepare(`
    INSERT INTO sync_state (tenant_id, store_id, resource, last_success_at, last_close_date, status, error, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
    ON CONFLICT(tenant_id, store_id, resource) DO UPDATE SET
      last_success_at = COALESCE(?4, sync_state.last_success_at),
      last_close_date = COALESCE(?5, sync_state.last_close_date),
      status = COALESCE(?6, sync_state.status),
      error = ?7,
      updated_at = datetime('now')
  `)
    .bind(
      tenantId,
      storeId,
      resource,
      state.lastSuccessAt ?? null,
      state.lastCloseDate ?? null,
      state.status ?? null,
      state.error ?? null,
    )
    .run();
}

// ---------------------------------------------------------------------------
// Синхронизация ресурсов одного тенанта
// ---------------------------------------------------------------------------

async function syncTenantShops(db: D1Database, evo: Evotor, tenantId: string): Promise<string[]> {
  await setSyncState(db, tenantId, "*", "shops", { status: "running" });
  const shops = await evo.getShops();
  const shopsData = Array.isArray(shops)
    ? shops.map((s: any) => ({ uuid: s.uuid, name: s.name, address: s.address ?? "" }))
    : [];
  await upsertShops(db, shopsData);
  await setSyncState(db, tenantId, "*", "shops", {
    lastSuccessAt: new Date().toISOString(),
    status: "ok",
    error: null,
  });
  console.log(`[syncTenant:${tenantId}] Магазинов: ${shopsData.length}`);
  return shopsData.map((s) => s.uuid);
}

async function syncTenantEmployees(db: D1Database, evo: Evotor, tenantId: string): Promise<void> {
  await setSyncState(db, tenantId, "*", "employees", { status: "running" });
  const employees = await evo.getEmployees();
  const employeesData = Array.isArray(employees)
    ? employees.map((e: any) => ({
        uuid: e.uuid,
        name: e.name ?? "",
        lastName: e.lastName ?? "",
        role: e.role ?? "",
        stores: e.stores ?? [],
      }))
    : [];
  await upsertEmployees(db, employeesData);
  await setSyncState(db, tenantId, "*", "employees", {
    lastSuccessAt: new Date().toISOString(),
    status: "ok",
    error: null,
  });
  console.log(`[syncTenant:${tenantId}] Сотрудников: ${employeesData.length}`);
}

async function syncTenantDevices(
  db: D1Database,
  evo: Evotor,
  tenantId: string,
  _shops: string[],
): Promise<void> {
  await setSyncState(db, tenantId, "*", "devices", { status: "running" });
  const upsert = db.prepare(`
    INSERT INTO devices (id, name, imei, store_id, user_id, model, timezone_offset, tenant_id)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      imei = excluded.imei,
      store_id = excluded.store_id,
      user_id = excluded.user_id,
      model = excluded.model,
      timezone_offset = excluded.timezone_offset,
      tenant_id = excluded.tenant_id,
      updated_at = datetime('now')
  `);

  const devices = await evo.getDevices();
  const batch = devices.map((d: any) =>
    upsert.bind(
      d.id,
      d.name ?? "",
      d.imei ?? "",
      d.store_id ?? "",
      d.user_id ?? "",
      d.model ?? "",
      d.timezone_offset ?? 0,
      tenantId,
    ),
  );
  if (batch.length > 0) await db.batch(batch);

  await setSyncState(db, tenantId, "*", "devices", {
    lastSuccessAt: new Date().toISOString(),
    status: "ok",
    error: null,
  });
  console.log(`[syncTenant:${tenantId}] Терминалов: ${devices.length}`);
}

async function syncTenantProducts(
  db: D1Database,
  evo: Evotor,
  tenantId: string,
  shops: string[],
): Promise<void> {
  for (const shopId of shops) {
    await setSyncState(db, tenantId, shopId, "products", { status: "running" });
    await delay(500);
    const products = await evo.getProductsUuid(shopId);
    await updateOrInsertData(products, db);

    const productsFull = await evo.getProductsShopUuidsT(shopId);
    await updateOrInsertDataS(productsFull, db);

    await setSyncState(db, tenantId, shopId, "products", {
      lastSuccessAt: new Date().toISOString(),
      status: "ok",
      error: null,
    });
  }
  console.log(`[syncTenant:${tenantId}] Товары синхронизированы по ${shops.length} магазинам`);
}

async function syncTenantStock(
  db: D1Database,
  evo: Evotor,
  tenantId: string,
  shops: string[],
): Promise<void> {
  const productStmt = db.prepare(`
    UPDATE shopProduct SET quantity = ?1, price = ?2, measureName = ?3
    WHERE shopId = ?4 AND uuid = ?5
  `);

  for (const shopId of shops) {
    await setSyncState(db, tenantId, shopId, "stock", { status: "running" });
    const raw = await evo.getProducts(shopId);
    const items: any[] = Array.isArray(raw) ? raw : (raw as any)?.items ?? [];
    const batch = [];
    for (const item of items) {
      const uuid = item.uuid;
      if (!uuid) continue;
      batch.push(
        productStmt.bind(
          item.quantity ?? 0,
          item.price ?? 0,
          item.measure_name || "шт",
          shopId,
          uuid,
        ),
      );
    }
    if (batch.length > 0) await db.batch(batch);

    await setSyncState(db, tenantId, shopId, "stock", {
      lastSuccessAt: new Date().toISOString(),
      status: "ok",
      error: null,
    });
  }
  console.log(`[syncTenant:${tenantId}] Остатки синхронизированы`);
}

/**
 * Синхронизация ВСЕХ типов документов Эвотор.
 * Первый прогон — backfill на sync_backfill_days (default 90), далее дельта.
 * Каждый документ сохраняется целиком (raw_json) в index_documents.
 */
async function syncTenantDocuments(
  db: D1Database,
  evo: Evotor,
  tenantId: string,
  shops: string[],
): Promise<void> {
  const backfillDays = await getNumberSetting(db, "sync_backfill_days", 90);
  const now = new Date();

  for (const shopId of shops) {
    await setSyncState(db, tenantId, shopId, "documents", { status: "running" });
    const st = await getSyncState(db, tenantId, shopId, "documents");
    const hasHistory = Boolean(st?.last_success_at);

    const since = new Date(now);
    if (hasHistory) {
      // Дельта: последние 24 часа (надёжно перекрывает любые задержки API)
      since.setDate(since.getDate() - 1);
    } else {
      // Первичная загрузка: backfill
      since.setDate(since.getDate() - (backfillDays || 90));
    }

    const sinceStr = formatDateWithTime(since, false);
    const untilStr = formatDateWithTime(now, true);

    const docs = await evo.getDocumentsIndex(shopId, sinceStr, untilStr);

    // Помечаем документы принадлежностью к тенанту
    const tenantDocs = docs.map((d) => ({ ...d, tenant_id: tenantId }));

    await saveNewIndexDocuments(db, tenantDocs);

    let maxCloseDate: string | null = null;
    for (const d of docs) {
      if (!maxCloseDate || (d.closeDate && d.closeDate > maxCloseDate)) {
        maxCloseDate = d.closeDate ?? null;
      }
    }

    await setSyncState(db, tenantId, shopId, "documents", {
      lastSuccessAt: new Date().toISOString(),
      lastCloseDate: maxCloseDate,
      status: "ok",
      error: null,
    });
    console.log(
      `[syncTenant:${tenantId}] Документы (${shopId}): ${docs.length} шт, last_close_date=${maxCloseDate}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Главный цикл
// ---------------------------------------------------------------------------

const DEFAULT_INTERVALS_MIN: Record<string, number> = {
  documents: 5,
  stock: 30,
  products: 25,
  meta: 20, // shops / employees / devices
};

/** Сколько минут прошло с последнего успеха по ресурсу (0 = ещё не было). */
async function minutesSinceLastSuccess(
  db: D1Database,
  tenantId: string,
  storeId: string,
  resource: string,
): Promise<number> {
  const st = await getSyncState(db, tenantId, storeId, resource);
  if (!st?.last_success_at) return Infinity;
  const raw = st.last_success_at;
  // Храним ISO или "YYYY-MM-DD HH:MM:SS" — нормализуем оба формата
  const normalized = raw.includes(" ") ? `${raw.replace(" ", "T")}Z` : raw;
  const ms = Date.now() - new Date(normalized).getTime();
  if (Number.isNaN(ms)) return Infinity;
  return ms / 60000;
}

/**
 * Синхронизирует все данные одного тенанта с Эвотор.
 * Каждый ресурс выполняется, только если подошёл его интервал.
 * opts.force=true — игнорировать интервалы (для ручного запуска/отладки).
 */
export async function syncTenant(
  db: D1Database,
  tenant: TenantRow,
  opts?: { force?: boolean },
): Promise<void> {
  if (runningTenants.has(tenant.id)) {
    console.log(`[syncTenant:${tenant.id}] Уже выполняется, пропускаем`);
    return;
  }
  runningTenants.add(tenant.id);
  try {
    await syncTenantInner(db, tenant, opts);
  } finally {
    runningTenants.delete(tenant.id);
  }
}

// Множество тенантов, которые сейчас синхронизируются (защита от гонок)
const runningTenants = new Set<string>();

async function syncTenantInner(
  db: D1Database,
  tenant: TenantRow,
  opts?: { force?: boolean },
): Promise<void> {
  const tenantId = tenant.id;
  if (!tenant.evotor_token) {
    console.error(`[syncTenant:${tenantId}] Нет токена, пропускаем`);
    return;
  }

  await createIndexDocumentsTable(db);
  await runMigrations(db);
  await createTenantsTable(db);
  await createSyncStateTable(db);
  await createProductsTableIfNotExists(db);
  await createShopProductTable(db);
  await createShopsTable(db);
  await createEmployeesTable(db);
  await createDevicesTable(db);

  const evo = new Evotor(tenant.evotor_token);
  const delayReq = await getNumberSetting(db, "sync_delay_requests", 2000);

  const intervals = await getNumberSetting(db, "sync_intervals_scale", 1);
  const force = opts?.force === true;
  const minutesDue = (resource: string, storeId = "*") =>
    force
      ? Promise.resolve(true)
      : minutesSinceLastSuccess(db, tenantId, storeId, resource)
          .then((m) => m >= DEFAULT_INTERVALS_MIN[resource] * intervals);
  const metaDue = (resource: string) =>
    force
      ? Promise.resolve(true)
      : minutesSinceLastSuccess(db, tenantId, "*", resource)
          .then((m) => m >= DEFAULT_INTERVALS_MIN.meta * intervals);

  // 1. Магазины (нужны для остальных ресурсов)
  let shops: string[] = [];
  try {
    if (await metaDue("shops")) {
      shops = await syncTenantShops(db, evo, tenantId);

      if (await metaDue("employees")) {
        try {
          await syncTenantEmployees(db, evo, tenantId);
        } catch (e: any) {
          await setSyncState(db, tenantId, "*", "employees", {
            status: "error",
            error: e?.message ?? String(e),
          });
          console.error(`[syncTenant:${tenantId}] Ошибка сотрудников:`, e?.message);
        }
      }
      if (await metaDue("devices")) {
        try {
          await syncTenantDevices(db, evo, tenantId, shops);
        } catch (e: any) {
          await setSyncState(db, tenantId, "*", "devices", {
            status: "error",
            error: e?.message ?? String(e),
          });
          console.error(`[syncTenant:${tenantId}] Ошибка терминалов:`, e?.message);
        }
      }
    } else {
      // Meta-интервал ещё не подошёл — берём магазины из локальной БД
      shops = await getShopUuidsFromDB(db);
    }
  } catch (e: any) {
    await setSyncState(db, tenantId, "*", "shops", {
      status: "error",
      error: e?.message ?? String(e),
    });
    console.error(`[syncTenant:${tenantId}] Ошибка мета-синхронизации:`, e?.message);
    shops = await getShopUuidsFromDB(db);
  }

  // 2. Товары и остатки — по магазинам
  for (const shopId of shops) {
    try {
      if (await minutesDue("products", shopId)) {
        await syncTenantProducts(db, evo, tenantId, [shopId]);
      }
    } catch (e: any) {
      await setSyncState(db, tenantId, shopId, "products", {
        status: "error",
        error: e?.message ?? String(e),
      });
      console.error(`[syncTenant:${tenantId}] Ошибка товаров (${shopId}):`, e?.message);
    }
    try {
      if (await minutesDue("stock", shopId)) {
        await syncTenantStock(db, evo, tenantId, [shopId]);
      }
    } catch (e: any) {
      await setSyncState(db, tenantId, shopId, "stock", {
        status: "error",
        error: e?.message ?? String(e),
      });
      console.error(`[syncTenant:${tenantId}] Ошибка остатков (${shopId}):`, e?.message);
    }
    await delay(delayReq);
  }

  // 3. Документы (все 18 типов) — по магазинам
  for (const shopId of shops) {
    try {
      if (await minutesDue("documents", shopId)) {
        await syncTenantDocuments(db, evo, tenantId, [shopId]);
      }
    } catch (e: any) {
      await setSyncState(db, tenantId, shopId, "documents", {
        status: "error",
        error: e?.message ?? String(e),
      });
      console.error(`[syncTenant:${tenantId}] Ошибка документов (${shopId}):`, e?.message);
    }
    await delay(delayReq);
  }

  console.log(`[syncTenant:${tenantId}] Цикл завершён`);
}

/**
 * Прогоняет синхронизацию по всем активным тенантам.
 * Безопасен для вызова каждые N минут: интервалы per-resource соблюдаются внутри.
 */
export async function runAllTenants(
  db: D1Database,
  opts?: { force?: boolean },
): Promise<void> {
  await createTenantsTable(db);
  await createSyncStateTable(db);
  const tenants = await getActiveTenants(db);
  console.log(`[syncEngine] Тенантов активных: ${tenants.length}${opts?.force ? " (force)" : ""}`);
  for (const tenant of tenants) {
    try {
      await syncTenant(db, tenant, opts);
    } catch (e: any) {
      console.error(`[syncEngine] Тенант ${tenant.id} упал:`, e?.message ?? e);
    }
  }
}
