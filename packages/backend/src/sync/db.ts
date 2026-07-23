import type { D1Database } from "@cloudflare/workers-types";
import { getCostPriceMapByUuid } from "../evotor/utils";

// ============================================================================
// Helpers
// ============================================================================

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Table: products
// ============================================================================

export async function createProductsTableIfNotExists(
  db: D1Database,
): Promise<void> {
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT,
          group_x BOOLEAN NOT NULL,
          parentUuid TEXT
        )`,
      )
      .run();
    console.log("Таблица 'products' успешно создана или уже существует.");
  } catch (err) {
    console.error("Ошибка при создании таблицы products:", err);
  }
}

export async function updateOrInsertData(
  data: { uuid: string; group: boolean; parentUuid: string }[],
  db: D1Database,
): Promise<void> {
  for (const item of data) {
    const { uuid, group, parentUuid } = item;
    const groupValue = group ? 1 : 0;

    const checkResult = (await db
      .prepare("SELECT COUNT(*) as count FROM products WHERE uuid = ?")
      .bind(uuid)
      .first()) as { count: number } | null;

    if (checkResult && checkResult.count > 0) {
      await db
        .prepare(
          "UPDATE products SET group_x = ?, parentUuid = ? WHERE uuid = ?",
        )
        .bind(groupValue, parentUuid, uuid)
        .run();
    } else {
      await db
        .prepare(
          "INSERT INTO products (uuid, group_x, parentUuid) VALUES (?, ?, ?)",
        )
        .bind(uuid, groupValue, parentUuid)
        .run();
    }
  }
  console.log(`Обработано ${data.length} записей в таблице products`);
}

// ============================================================================
// Table: shopProduct
// ============================================================================

export async function createShopProductTable(
  db: D1Database,
): Promise<void> {
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS shopProduct (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT NOT NULL,
          product_group BOOLEAN NOT NULL,
          parentUuid TEXT,
          shopId TEXT NOT NULL,
          name TEXT
        )`,
      )
      .run();
    console.log("Таблица 'shopProduct' успешно создана или уже существует.");
  } catch (err) {
    console.error("Ошибка при создании таблицы shopProduct:", err);
  }
}

export async function updateOrInsertDataS(
  data: {
    uuid: string;
    group: boolean;
    parentUuid: string;
    shopId: string;
    name: string;
  }[],
  db: D1Database,
): Promise<void> {
  const insertQuery = `
    INSERT INTO shopProduct (uuid, product_group, parentUuid, shopId, name)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE NOT EXISTS (
      SELECT 1 FROM shopProduct WHERE shopId = ?4 AND uuid = ?1
    )
  `;
  const statement = await db.prepare(insertQuery);
  const batch = data.map((item) =>
    statement.bind(
      item.uuid,
      item.group ? 1 : 0,
      item.parentUuid,
      item.shopId,
      item.name,
    ),
  );
  await db.batch(batch);
  console.log(`Обработано ${data.length} записей в таблице shopProduct`);
}

// ============================================================================
// Table: plan — sync-specific read/write (date, shopUuid, sum)
// ============================================================================

interface PlanByShops {
  [shopUuid: string]: number;
}

interface PlanItem {
  shopUuid: string;
  sum: number;
}

export async function getPlan(
  date: string,
  db: D1Database,
): Promise<Record<string, number> | null> {
  const result = await db
    .prepare("SELECT * FROM plan WHERE date = ?")
    .bind(date)
    .all<PlanItem>();

  const results = result.results;
  if (!results || results.length === 0) return null;

  const planByShops: Record<string, number> = {};
  for (const item of results) {
    planByShops[item.shopUuid] = item.sum;
  }
  return planByShops;
}

export async function updatePlanDb(
  planByShops: PlanByShops,
  date: string,
  db: D1Database,
): Promise<void> {
  const checkResult = (await db
    .prepare("SELECT COUNT(*) as count FROM plan WHERE date = ?")
    .bind(date)
    .first()) as { count: number } | null;

  if (checkResult && checkResult.count > 0) {
    const stmt = db.prepare(
      "UPDATE plan SET sum = ? WHERE date = ? AND shopUuid = ?",
    );
    for (const [shopUuid, sum] of Object.entries(planByShops)) {
      await stmt.bind(sum, date, shopUuid).run();
    }
  } else {
    const stmt = db.prepare(
      "INSERT INTO plan (date, shopUuid, sum) VALUES (?, ?, ?)",
    );
    for (const [shopUuid, sum] of Object.entries(planByShops)) {
      await stmt.bind(date, shopUuid, sum).run();
    }
  }
  console.log(
    `План обновлён: ${Object.keys(planByShops).length} магазинов за ${date}`,
  );
}

// ============================================================================
// Table: salary_bonus — read latest salary/bonus
// ============================================================================

interface SalaryBonus {
  salary: number;
  bonus: number;
  data: string;
}

export async function getSalaryAndBonus(
  date: string,
  db: D1Database,
): Promise<SalaryBonus | null> {
  const result = await db
    .prepare(
      `SELECT salary, bonus, data FROM salary_bonus
       WHERE data <= ? ORDER BY data DESC LIMIT 1`,
    )
    .bind(date)
    .all();

  if (result && result.results && result.results.length > 0) {
    return result.results[0] as unknown as SalaryBonus;
  }
  return null;
}

// ============================================================================
// Table: salaryData
// ============================================================================

export async function createSalaryTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS salaryData (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        shopUuid TEXT NOT NULL,
        employeeUuid TEXT NOT NULL,
        bonusAccessories INTEGER NOT NULL,
        dataPlan INTEGER NOT NULL,
        salesDataVape INTEGER NOT NULL,
        bonusPlan INTEGER NOT NULL,
        totalBonus INTEGER NOT NULL
      )`,
    )
    .run();
  console.log("Таблица 'salaryData' успешно создана или уже существует.");
}

export async function saveSalaryData(
  db: D1Database,
  dataReport: Record<string, unknown>,
): Promise<void> {
  const existingRecord = await db
    .prepare("SELECT 1 FROM salaryData WHERE date = ? AND shopUuid = ?")
    .bind(dataReport.date as string, dataReport.shopUuid as string)
    .first();

  if (existingRecord) {
    console.log(
      `Запись за ${dataReport.date} / ${dataReport.shopUuid} уже существует. Пропуск.`,
    );
    return;
  }

  await db
    .prepare(
      `INSERT INTO salaryData (
        date, shopUuid, employeeUuid, bonusAccessories,
        dataPlan, salesDataVape, bonusPlan, totalBonus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      dataReport.date as string,
      dataReport.shopUuid as string,
      dataReport.employeeUuid as string,
      dataReport.bonusAccessories as number,
      dataReport.dataPlan as number,
      dataReport.salesDataVape as number,
      dataReport.bonusPlan as number,
      dataReport.totalBonus as number,
    )
    .run();

  console.log("Данные сохранены в таблицу salaryData.");
}

// ============================================================================
// Table: SaleByPlan
// ============================================================================

export async function initializeSaleByPlanTable(
  db: D1Database,
): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS SaleByPlan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        shopName TEXT NOT NULL,
        datePlan INTEGER NOT NULL,
        dataSales INTEGER NOT NULL,
        dataQuantity TEXT NOT NULL,
        UNIQUE(date, shopName)
      )`,
    )
    .run();
  console.log("Таблица 'SaleByPlan' успешно создана или уже существует.");
}

export async function upsertSaleByPlanData(
  db: D1Database,
  salesData: Record<
    string,
    {
      date: string;
      datePlan: number;
      dataSales: number;
      dataQuantity: Record<string, number>;
    }
  >,
): Promise<void> {
  for (const [shopName, shopData] of Object.entries(salesData)) {
    const dataQuantityJson = JSON.stringify(shopData.dataQuantity);

    if (
      !shopName ||
      !shopData.date ||
      shopData.datePlan == null ||
      shopData.dataSales == null
    ) {
      console.error(`Пропущены данные для магазина ${shopName}`);
      continue;
    }

    await db
      .prepare(
        `INSERT INTO SaleByPlan (date, shopName, datePlan, dataSales, dataQuantity)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date, shopName) DO UPDATE SET
           datePlan = excluded.datePlan,
           dataSales = excluded.dataSales,
           dataQuantity = excluded.dataQuantity`,
      )
      .bind(
        shopData.date,
        shopName,
        shopData.datePlan,
        shopData.dataSales,
        dataQuantityJson,
      )
      .run();
  }
  console.log("Данные SaleByPlan обновлены.");
}

export async function getSalesDataByDate(
  date: string,
  db: D1Database,
): Promise<Record<
  string,
  { datePlan: number; dataSales: number; dataQuantity: Record<string, number> }
> | null> {
  const result = await db
    .prepare("SELECT * FROM SaleByPlan WHERE date = ?")
    .bind(date)
    .all();

  const rows = result.results;
  if (!rows || rows.length === 0) return null;

  const salesDataByShops: Record<
    string,
    {
      datePlan: number;
      dataSales: number;
      dataQuantity: Record<string, number>;
    }
  > = {};

  for (const item of rows) {
    const shopName = item.shopName as string;
    const dataQuantity = JSON.parse(item.dataQuantity as string);
    if (!shopName || !dataQuantity) continue;
    salesDataByShops[shopName] = {
      datePlan: item.datePlan as number,
      dataSales: item.dataSales as number,
      dataQuantity,
    };
  }

  return salesDataByShops;
}

// ============================================================================
// Helpers for plan update (used by updateDataSaleByPlan)
// ============================================================================

export async function updatePlan(
  planByShops: PlanByShops,
  date: string,
  db: D1Database,
): Promise<void> {
  const checkResult = (await db
    .prepare("SELECT COUNT(*) as count FROM plan WHERE date = ?")
    .bind(date)
    .first()) as { count: number } | null;

  if (checkResult && checkResult.count > 0) {
    const stmt = db.prepare(
      "UPDATE plan SET sum = ? WHERE date = ? AND shopUuid = ?",
    );
    for (const [shopUuid, sum] of Object.entries(planByShops)) {
      await stmt.bind(sum, date, shopUuid).run();
    }
  } else {
    const stmt = db.prepare(
      "INSERT INTO plan (date, shopUuid, sum) VALUES (?, ?, ?)",
    );
    for (const [shopUuid, sum] of Object.entries(planByShops)) {
      await stmt.bind(date, shopUuid, sum).run();
    }
  }
}

// ============================================================================
// Table: shops
// ============================================================================

export async function createShopsTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS shops (
        uuid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT DEFAULT ''
      )`
    )
    .run();
  console.log("Таблица 'shops' успешно создана или уже существует.");
}

export async function upsertShops(
  db: D1Database,
  shops: { uuid: string; name: string; address?: string }[]
): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO shops (uuid, name, address) VALUES (?, ?, ?)
     ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, address = excluded.address`
  );
  for (const s of shops) {
    await stmt.bind(s.uuid, s.name, s.address ?? "").run();
  }
  console.log(`Синхронизировано магазинов: ${shops.length}`);
}

export async function getShopUuidsFromDB(db: D1Database): Promise<string[]> {
  const result = await db.prepare("SELECT uuid FROM shops").all<{ uuid: string }>();
  return (result.results ?? []).map((r) => r.uuid);
}

export async function getShopNameFromDB(db: D1Database, shopUuid: string): Promise<string> {
  const result = await db.prepare("SELECT name FROM shops WHERE uuid = ?").bind(shopUuid).first<{ name: string }>();
  return result?.name ?? shopUuid;
}

export async function getShopNameUuidsFromDB(db: D1Database): Promise<{ uuid: string; name: string }[]> {
  const result = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
  return result.results ?? [];
}

// ============================================================================
// Table: employees
// ============================================================================

export async function createEmployeesTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS employees (
        uuid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        last_name TEXT DEFAULT '',
        role TEXT DEFAULT '',
        stores TEXT DEFAULT '[]'
      )`
    )
    .run();
  console.log("Таблица 'employees' успешно создана или уже существует.");
}

export async function upsertEmployees(
  db: D1Database,
  employees: { uuid: string; name: string; lastName?: string; role?: string; stores?: string[] }[]
): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO employees (uuid, name, last_name, role, stores) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, last_name = excluded.last_name, role = excluded.role, stores = excluded.stores`
  );
  for (const e of employees) {
    await stmt.bind(e.uuid, e.name, e.lastName ?? "", e.role ?? "", JSON.stringify(e.stores ?? [])).run();
  }
  console.log(`Синхронизировано сотрудников: ${employees.length}`);
}

export async function getEmployeeNameFromDB(db: D1Database, lastName: string): Promise<string | null> {
  const result = await db.prepare("SELECT name FROM employees WHERE last_name = ?").bind(lastName).first<{ name: string }>();
  return result?.name ?? null;
}

export async function getEmployeeNameByUuid(db: D1Database, uuid: string): Promise<string | null> {
  const result = await db.prepare("SELECT name FROM employees WHERE uuid = ?").bind(uuid).first<{ name: string }>();
  return result?.name ?? null;
}

export async function getEmployeeByLastNameDB(db: D1Database, lastName: string): Promise<{ uuid: string; name: string }[]> {
  const result = await db.prepare("SELECT uuid, name FROM employees WHERE last_name = ?").bind(lastName).all<{ uuid: string; name: string }>();
  return result.results ?? [];
}

export async function getEmployeesByShopIdDB(db: D1Database, shopId: string): Promise<{ uuid: string; name: string }[]> {
  const result = await db.prepare("SELECT uuid, name, stores FROM employees").all<{ uuid: string; name: string; stores: string }>();
  return (result.results ?? [])
    .filter((r) => {
      try { const s = JSON.parse(r.stores); return s.includes(shopId); } catch { return false; }
    })
    .map((r) => ({ uuid: r.uuid, name: r.name }));
}

export async function getEmployeeRoleFromDB(db: D1Database, lastName: string): Promise<string> {
  const result = await db.prepare("SELECT role FROM employees WHERE last_name = ?").bind(lastName).first<{ role: string }>();
  return result?.role ?? "null";
}

export async function getEmployeesLastNameAndUuidFromDB(db: D1Database): Promise<{ uuid: string; name: string }[]> {
  const result = await db.prepare("SELECT uuid, name FROM employees").all<{ uuid: string; name: string }>();
  return result.results ?? [];
}

export async function getEmployeesDictFromDB(db: D1Database): Promise<Record<string, string>> {
  const result = await db.prepare("SELECT uuid, name FROM employees").all<{ uuid: string; name: string }>();
  const dict: Record<string, string> = {};
  for (const r of result.results ?? []) dict[r.uuid] = r.name;
  return dict;
}

export async function getShopNameUuidsDictFromDB(db: D1Database): Promise<Record<string, string>> {
  const result = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
  const dict: Record<string, string> = {};
  for (const r of result.results ?? []) dict[r.uuid] = r.name;
  return dict;
}

// ============================================================================
// Table: seller_daily_metrics — precomputed per-seller per-day stats
// Used by computeSellerAdvancedStats as a fast cache layer.
// Aggregated nightly via aggregateSellerDailyMetrics cron task.
// ============================================================================

export async function createSellerDailyMetricsTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS seller_daily_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        seller_uuid TEXT NOT NULL,
        seller_name TEXT NOT NULL DEFAULT '',
        shop_id TEXT NOT NULL DEFAULT '',
        revenue REAL NOT NULL DEFAULT 0,
        checks INTEGER NOT NULL DEFAULT 0,
        acc_revenue REAL NOT NULL DEFAULT 0,
        vape_revenue REAL NOT NULL DEFAULT 0,
        discount_checks INTEGER NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        margin_rub REAL NOT NULL DEFAULT 0,
        shift_hours REAL NOT NULL DEFAULT 0,
        first_check_ts TEXT,
        first_check_delay INTEGER NOT NULL DEFAULT 0,
        absent_slots TEXT NOT NULL DEFAULT '[]',
        absent_probability REAL NOT NULL DEFAULT 0,
        UNIQUE(seller_uuid, date, shop_id)
      )`,
    )
    .run();

  // Идемпотентная миграция для существующих таблиц (ALTER TABLE ADD COLUMN)
  try {
    await db.prepare(`ALTER TABLE seller_daily_metrics ADD COLUMN margin_rub REAL NOT NULL DEFAULT 0`).run();
    console.log("[migration] Колонка margin_rub добавлена в seller_daily_metrics.");
  } catch (err: any) {
    if (!String(err?.message ?? err).toLowerCase().includes("duplicate column")) {
      console.error("[migration] Неожиданная ошибка при ALTER TABLE margin_rub:", err);
    }
  }
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_sdm_seller_date ON seller_daily_metrics (seller_uuid, date)`)
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_sdm_shop_date ON seller_daily_metrics (shop_id, date)`)
    .run();
  console.log("Таблица 'seller_daily_metrics' создана или уже существует.");
}

export interface SellerDailyMetric {
  date: string;
  seller_uuid: string;
  seller_name: string;
  shop_id: string;
  revenue: number;
  checks: number;
  acc_revenue: number;
  vape_revenue: number;
  discount_checks: number;
  discount_amount: number;
  /** Маржа (выручка − себестоимость) за день, ₽. Может быть занижена, если у части
      позиций в Эвоторе не указана себестоимость (costPrice) — в этом случае такие
      позиции считаются с нулевой себестоимостью, см. aggregateSellerDailyMetrics. */
  margin_rub: number;
  shift_hours: number;
  first_check_ts: string | null;
  /** Минуты от открытия смены до первого чека */
  first_check_delay: number;
  /** JSON-массив absent-слотов [{from, to, minutes, probability}] */
  absent_slots: string;
  /** 0..1 — общая вероятность длительного отсутствия (по самому длинному слоту) */
  absent_probability: number;
}

export async function upsertSellerDailyMetrics(
  db: D1Database,
  rows: SellerDailyMetric[],
): Promise<void> {
  if (rows.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO seller_daily_metrics
       (date, seller_uuid, seller_name, shop_id, revenue, checks,
        acc_revenue, vape_revenue, discount_checks, discount_amount, margin_rub,
        shift_hours, first_check_ts, first_check_delay, absent_slots, absent_probability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(seller_uuid, date, shop_id) DO UPDATE SET
       seller_name = excluded.seller_name,
       revenue = excluded.revenue,
       checks = excluded.checks,
       acc_revenue = excluded.acc_revenue,
       vape_revenue = excluded.vape_revenue,
       discount_checks = excluded.discount_checks,
       discount_amount = excluded.discount_amount,
       margin_rub = excluded.margin_rub,
       shift_hours = excluded.shift_hours,
       first_check_ts = excluded.first_check_ts,
       first_check_delay = excluded.first_check_delay,
       absent_slots = excluded.absent_slots,
       absent_probability = excluded.absent_probability`,
  );
  const batch = rows.map((r) =>
    stmt.bind(
      r.date,
      r.seller_uuid,
      r.seller_name,
      r.shop_id,
      r.revenue,
      r.checks,
      r.acc_revenue,
      r.vape_revenue,
      r.discount_checks,
      r.discount_amount,
      r.margin_rub,
      r.shift_hours,
      r.first_check_ts,
      r.first_check_delay,
      r.absent_slots,
      r.absent_probability,
    ),
  );
  await db.batch(batch);
  console.log(`[seller_daily_metrics] upserted ${rows.length} rows`);
}

export async function getSellerDailyMetrics(
  db: D1Database,
  since: string,
  until: string,
  shopId?: string,
): Promise<SellerDailyMetric[]> {
  try {
    let sql = `SELECT * FROM seller_daily_metrics WHERE date >= ? AND date <= ?`;
    const binds: any[] = [since, until];
    if (shopId && shopId !== "all") {
      sql += ` AND shop_id = ?`;
      binds.push(shopId);
    }
    sql += ` ORDER BY date, seller_uuid`;
    const res = await db.prepare(sql).bind(...binds).all<SellerDailyMetric>();
    return res.results ?? [];
  } catch {
    // Table may not exist yet (never aggregated)
    return [];
  }
}

// ============================================================================
// Table: shop_schedules
// ============================================================================

export interface ShopScheduleRow {
  shop_id: string;
  weekday: number;       // 0=Вс, 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб
  open_time: string;     // "HH:MM"
  close_time: string;    // "HH:MM"
  is_working_day: boolean;
}

export async function createShopSchedulesTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS shop_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL,
        weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
        open_time TEXT NOT NULL DEFAULT '09:00',
        close_time TEXT NOT NULL DEFAULT '21:00',
        is_working_day INTEGER NOT NULL DEFAULT 1,
        UNIQUE(shop_id, weekday)
      )`,
    )
    .run();
  console.log("Таблица 'shop_schedules' создана или уже существует.");
}

/** Сохранить расписание (массив записей) с валидацией open < close */
export async function upsertShopSchedules(
  db: D1Database,
  rows: ShopScheduleRow[],
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const valid: ShopScheduleRow[] = [];

  for (const r of rows) {
    if (r.is_working_day && r.open_time >= r.close_time) {
      errors.push(
        `shop=${r.shop_id} day=${r.weekday}: open (${r.open_time}) должно быть < close (${r.close_time})`,
      );
      continue;
    }
    valid.push(r);
  }

  if (valid.length > 0) {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO shop_schedules (shop_id, weekday, open_time, close_time, is_working_day)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const batch = valid.map((r) =>
      stmt.bind(r.shop_id, r.weekday, r.open_time, r.close_time, r.is_working_day ? 1 : 0),
    );
    await db.batch(batch);
  }

  return { ok: errors.length === 0, errors };
}

/** Получить расписание для магазина (или всех) */
export async function getShopSchedules(
  db: D1Database,
  shopId?: string,
): Promise<ShopScheduleRow[]> {
  let sql = `SELECT shop_id, weekday, open_time, close_time, is_working_day FROM shop_schedules`;
  const binds: any[] = [];
  if (shopId) {
    sql += ` WHERE shop_id = ?`;
    binds.push(shopId);
  }
  sql += ` ORDER BY shop_id, weekday`;
  const res = await db.prepare(sql).bind(...binds).all<ShopScheduleRow>();
  return res.results ?? [];
}

// ============================================================================
// Table: seller_absence_events
// ============================================================================

export interface SellerAbsenceEvent {
  seller_uuid: string;
  date: string;
  start_time: string;       // "HH:MM"
  end_time: string;         // "HH:MM"
  duration_minutes: number;
  probability_absent: number; // 0..1
  explanation: string;
  recommendation: string;
}

export async function createSellerAbsenceEventsTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS seller_absence_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_uuid TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 0,
        probability_absent REAL NOT NULL DEFAULT 0,
        explanation TEXT NOT NULL DEFAULT '',
        recommendation TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    )
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_abs_seller_date ON seller_absence_events (seller_uuid, date)`)
    .run();
  console.log("Таблица 'seller_absence_events' создана или уже существует.");
}

export async function upsertAbsenceEvents(
  db: D1Database,
  events: SellerAbsenceEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO seller_absence_events
       (seller_uuid, date, start_time, end_time, duration_minutes, probability_absent, explanation, recommendation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const batch = events.map((e) =>
    stmt.bind(
      e.seller_uuid,
      e.date,
      e.start_time,
      e.end_time,
      e.duration_minutes,
      e.probability_absent,
      e.explanation,
      e.recommendation,
    ),
  );
  await db.batch(batch);
}

export async function getAbsenceEvents(
  db: D1Database,
  sellerUuid: string,
  since: string,
  until: string,
): Promise<SellerAbsenceEvent[]> {
  const res = await db
    .prepare(
      `SELECT seller_uuid, date, start_time, end_time, duration_minutes, probability_absent, explanation, recommendation
       FROM seller_absence_events
       WHERE seller_uuid = ? AND date >= ? AND date <= ?
       ORDER BY date, start_time`,
    )
    .bind(sellerUuid, since, until)
    .all<SellerAbsenceEvent>();
  return res.results ?? [];
}

// ============================================================================
// Table: dead_stock_cache
// Ночной кэш мёртвых остатков — чтобы не парсить JSON на лету
// ============================================================================

export interface DeadStockCacheRow {
  itemId: string;
  name: string;
  article: string | null;
  currentStock: number | null;
  daysWithoutSales: number;
  lastSaleDate: string | null;
  shopId: string;
  shopName: string;
  totalRevenueLast90Days: number;
  /** Закупочная цена за единицу (из 1С или Evotor costPrice) */
  unitCost: number | null;
  /** Заморожено: currentStock * unitCost */
  totalFrozenCost: number | null;
  updatedAt: string;
}

export async function createDeadStockCacheTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS dead_stock_cache (
        itemId TEXT NOT NULL,
        shopId TEXT NOT NULL,
        name TEXT NOT NULL,
        article TEXT,
        currentStock INTEGER,
        daysWithoutSales INTEGER NOT NULL DEFAULT 0,
        lastSaleDate TEXT,
        shopName TEXT NOT NULL DEFAULT '',
        totalRevenueLast90Days REAL NOT NULL DEFAULT 0,
        unitCost REAL,
        totalFrozenCost REAL,
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (itemId, shopId)
      )`,
    )
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_dsc_shop_days ON dead_stock_cache (shopId, daysWithoutSales)`)
    .run();
  // Миграция: добавляем колонки себестоимости, если их ещё нет
  try { await db.prepare(`ALTER TABLE dead_stock_cache ADD COLUMN unitCost REAL`).run(); } catch { /* ok */ }
  try { await db.prepare(`ALTER TABLE dead_stock_cache ADD COLUMN totalFrozenCost REAL`).run(); } catch { /* ok */ }
  console.log("Таблица 'dead_stock_cache' создана или уже существует.");
}

export async function refreshDeadStockCache(
  db: D1Database,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Все товары из shopProduct
  const products = await db.prepare(
    "SELECT uuid, name, shopId FROM shopProduct WHERE product_group = 0"
  ).all<{ uuid: string; name: string; shopId: string }>();

  // 2. Получаем имена магазинов
  const shops = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
  const shopNames = new Map(shops.results?.map(r => [r.uuid, r.name]) ?? []);

  // 3. Все SELL/PAYBACK за последние 90 дней
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);
  const sinceStr = since90.toISOString().slice(0, 10);

  const docs = await db.prepare(
    `SELECT shop_id, transactions, close_date, type FROM index_documents
     WHERE close_date >= ? AND type IN ('SELL', 'PAYBACK')`
  ).bind(sinceStr + "T00:00:00").all<{
    shop_id: string; transactions: string; close_date: string; type: string;
  }>();

  // 4. Обходим документы, агрегируем по товарам
  //    Ключ: uuid|shop_id ИЛИ name|shop_id (UUID разный в разных магазинах!)
  const lastSale = new Map<string, string>();
  const revenue90 = new Map<string, number>();
  const evotorCost = new Map<string, number>(); // Evotor costPrice per unit (fallback)
  const costDate = new Map<string, string>();   // дата для сравнения свежести costPrice

  for (const doc of docs.results ?? []) {
    const isRefund = doc.type === "PAYBACK";
    const sign = isRefund ? -1 : 1;
    const day = doc.close_date.slice(0, 10);
    let txs: any[];
    try { txs = JSON.parse(doc.transactions); } catch { continue; }
    if (!Array.isArray(txs)) continue;

    for (const tx of txs) {
      if (tx.type !== "REGISTER_POSITION") continue;
      const uuid = tx.commodityUuid;
      const name = (tx.commodityName || "").trim();
      if (!uuid && !name) continue;

      // Evotor costPrice — берём последнее значение (самое свежее)
      if (uuid && tx.costPrice != null && tx.costPrice > 0) {
        const costKey = `cost:${uuid}|${doc.shop_id}`;
        if (!evotorCost.has(costKey) || day > (costDate.get(costKey) || "")) {
          evotorCost.set(costKey, tx.costPrice);
          costDate.set(costKey, day);
        }
      }

      // Ключ по UUID (основной)
      if (uuid) {
        const key = `${uuid}|${doc.shop_id}`;
        revenue90.set(key, (revenue90.get(key) ?? 0) + (tx.sum ?? 0) * sign);
        if (!lastSale.has(key) || day > lastSale.get(key)!) {
          lastSale.set(key, day);
        }
      }
      // Ключ по имени (fallback — UUID может не совпадать между магазинами)
      if (name) {
        const nameKey = `name:${name}|${doc.shop_id}`;
        revenue90.set(nameKey, (revenue90.get(nameKey) ?? 0) + (tx.sum ?? 0) * sign);
        if (!lastSale.has(nameKey) || day > lastSale.get(nameKey)!) {
          lastSale.set(nameKey, day);
        }
      }
    }
  }

  // 5. Загружаем себестоимость из 1С (приоритет) или Evotor
  const costByUuid = await getCostPriceMapByUuid(db, sinceStr);

  // 6. Формируем строки кэша — матчим по UUID, затем по имени
  const rows: DeadStockCacheRow[] = [];
  for (const p of products.results ?? []) {
    // Сначала ищем по UUID (основной ключ)
    const uuidKey = `${p.uuid}|${p.shopId}`;
    let last = lastSale.get(uuidKey) || null;
    let rev = Math.round(revenue90.get(uuidKey) ?? 0);

    // Если не нашли по UUID — ищем по имени (fallback)
    if (!last && p.name) {
      const nameKey = `name:${p.name}|${p.shopId}`;
      last = lastSale.get(nameKey) || null;
      rev = Math.round(revenue90.get(nameKey) ?? 0);
    }

    const days = last
      ? Math.floor((Date.now() - new Date(last + "T12:00:00+03:00").getTime()) / 86400000)
      : 999;

    // Себестоимость из 1С (приоритет), иначе Evotor costPrice (fallback)
    const costKey = `cost:${p.uuid}|${p.shopId}`;
    const unitCost = costByUuid.get(p.uuid) ?? evotorCost.get(costKey) ?? null;
    // totalFrozenCost = цена за единицу (остаток неизвестен локально)
    const totalFrozenCost = (unitCost != null)
      ? Math.round(unitCost * 100) / 100
      : null;

    rows.push({
      itemId: p.uuid,
      name: p.name,
      article: null,
      currentStock: null,
      daysWithoutSales: days,
      lastSaleDate: last,
      shopId: p.shopId,
      shopName: shopNames.get(p.shopId) || p.shopId,
      totalRevenueLast90Days: rev,
      unitCost,
      totalFrozenCost,
      updatedAt: today,
    });
  }

  // 7. Очищаем и вставляем
  await db.prepare("DELETE FROM dead_stock_cache").run();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO dead_stock_cache
       (itemId, shopId, name, article, currentStock, daysWithoutSales, lastSaleDate, shopName, totalRevenueLast90Days, unitCost, totalFrozenCost, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const batch = rows.map(r =>
    stmt.bind(r.itemId, r.shopId, r.name, r.article, r.currentStock, r.daysWithoutSales, r.lastSaleDate, r.shopName, r.totalRevenueLast90Days, r.unitCost, r.totalFrozenCost, r.updatedAt)
  );
  await db.batch(batch);

  return rows.length;
}

export async function getDeadStockCache(
  db: D1Database,
  daysWithoutSales: number,
  shopId?: string,
  since?: string,
  until?: string,
): Promise<DeadStockCacheRow[]> {
  let sql = `SELECT * FROM dead_stock_cache WHERE daysWithoutSales >= ?`;
  const binds: any[] = [daysWithoutSales];

  // shopId: пропускаем если null/"all"/undefined
  if (shopId && shopId !== "all") {
    sql += ` AND shopId = ?`;
    binds.push(shopId);
  }

  // since: фильтр по lastSaleDate (>= since).
  // NULL lastSaleDate (никогда не продавался) — включается всегда, т.к. нет даты для сравнения
  if (since) {
    sql += ` AND (lastSaleDate >= ? OR lastSaleDate IS NULL)`;
    binds.push(since);
  }

  // until: фильтр по lastSaleDate (<= until)
  if (until) {
    sql += ` AND (lastSaleDate <= ? OR lastSaleDate IS NULL)`;
    binds.push(until);
  }

  sql += ` ORDER BY daysWithoutSales DESC, totalRevenueLast90Days DESC`;
  const res = await db.prepare(sql).bind(...binds).all<DeadStockCacheRow>();
  return res.results ?? [];
}
