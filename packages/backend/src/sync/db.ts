import type { D1Database } from "@cloudflare/workers-types";

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
        shift_hours REAL NOT NULL DEFAULT 0,
        first_check_ts TEXT,
        UNIQUE(seller_uuid, date, shop_id)
      )`,
    )
    .run();
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
  shift_hours: number;
  first_check_ts: string | null;
}

export async function upsertSellerDailyMetrics(
  db: D1Database,
  rows: SellerDailyMetric[],
): Promise<void> {
  if (rows.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO seller_daily_metrics
       (date, seller_uuid, seller_name, shop_id, revenue, checks,
        acc_revenue, vape_revenue, discount_checks, discount_amount,
        shift_hours, first_check_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(seller_uuid, date, shop_id) DO UPDATE SET
       seller_name = excluded.seller_name,
       revenue = excluded.revenue,
       checks = excluded.checks,
       acc_revenue = excluded.acc_revenue,
       vape_revenue = excluded.vape_revenue,
       discount_checks = excluded.discount_checks,
       discount_amount = excluded.discount_amount,
       shift_hours = excluded.shift_hours,
       first_check_ts = excluded.first_check_ts`,
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
      r.shift_hours,
      r.first_check_ts,
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
