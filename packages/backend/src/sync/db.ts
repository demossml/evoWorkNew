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
