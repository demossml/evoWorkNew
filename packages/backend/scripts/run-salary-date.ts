/**
 * run-salary-date.ts — расчёт зарплаты за конкретную дату.
 *
 * Использование:
 *   SALARY_DB=/path/to/local.db npx tsx scripts/run-salary-date.ts 2026-07-23
 *
 * Переменные окружения:
 *   SALARY_DB  — путь к SQLite-базе (если не задан — берёт из DATA_DIR или
 *                относительно packages/backend/data/local.db)
 *   DATA_DIR   — каталог с данными (по умолчанию ./data)
 *   EVOTOR_API_TOKEN — токен Эвотор API
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ─── DB path ───────────────────────────────────────────────────────────

function resolveDbPath(): string {
  // 1. Явно передан SALARY_DB
  if (process.env.SALARY_DB) return process.env.SALARY_DB;

  // 2. DATA_DIR + local.db
  const dataDir = process.env.DATA_DIR || path.resolve(__dirname, "..", "data");
  return path.join(dataDir, "local.db");
}

const DB_PATH = resolveDbPath();

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ База не найдена: ${DB_PATH}`);
  process.exit(1);
}

// ─── Args ──────────────────────────────────────────────────────────────

const datePlan = process.argv[2];
if (!datePlan) {
  console.error("Укажите дату: npx tsx scripts/run-salary-date.ts 2026-07-23");
  process.exit(1);
}

console.log(`📅 Дата: ${datePlan}`);
console.log(`🗄️  База: ${DB_PATH}`);

// ─── Расчёт ────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Проверяем, есть ли данные за эту дату
const docCount = db
  .prepare(
    `SELECT COUNT(*) as cnt FROM index_documents
     WHERE close_date >= ? AND close_date <= ? AND type = 'SELL'`,
  )
  .get(`${datePlan}T00:00:00`, `${datePlan}T23:59:59`) as { cnt: number };

if (docCount.cnt === 0) {
  console.log(`⚠️  Нет SELL-документов за ${datePlan}`);
  process.exit(0);
}

console.log(`📄 SELL-документов: ${docCount.cnt}`);

// План на дату
const planRows = db
  .prepare("SELECT shopId, datePlan FROM plan WHERE date = ?")
  .all(datePlan) as Array<{ shopId: string; datePlan: number }>;

if (planRows.length === 0) {
  console.log(`⚠️  Нет плана на ${datePlan}`);
  process.exit(0);
}

const datPlan: Record<string, number> = {};
for (const r of planRows) datPlan[r.shopId] = r.datePlan;

// Группы аксессуаров
const groupUuids: string[] = (db.prepare("SELECT uuid FROM accessories").all() as Array<{ uuid: string }>).map(r => r.uuid);

// Vape group UUIDs (from cron.ts)
const VAPE_GROUP_UUIDS = [
  "78ddfd78-dc52-11e8-b970-ccb0da458b5a",
  "bc9e7e4c-fdac-11ea-aaf2-2cf05d04be1d",
  "0627db0b-4e39-11ec-ab27-2cf05d04be1d",
  "2b8eb6b4-92ea-11ee-ab93-2cf05d04be1d",
  "8a8fcb5f-9582-11ee-ab93-2cf05d04be1d",
  "97d6fa81-84b1-11ea-b9bb-70c94e4ebe6a",
  "ad8afa41-737d-11ea-b9b9-70c94e4ebe6a",
  "568905bd-9460-11ee-9ef4-be8fe126e7b9",
  "568905be-9460-11ee-9ef4-be8fe126e7b9",
];

// Бонус
const bonusRow = db.prepare("SELECT bonus FROM salary_bonus WHERE date = ?").get(datePlan) as { bonus: number } | undefined;
const bonus = bonusRow?.bonus ?? 0;

// Открытые смены
const sessions = db
  .prepare(
    `SELECT shop_id, open_user_uuid FROM index_documents
     WHERE close_date >= ? AND close_date <= ? AND type = 'OPEN_SESSION'`,
  )
  .all(`${datePlan}T00:00:00`, `${datePlan}T23:59:59`) as Array<{
    shop_id: string;
    open_user_uuid: string;
  }>;

console.log(`🚪 Открытых смен: ${sessions.length}`);

// Вспомогательные функции
function getProductUuidsByParentUuids(parentUuids: string[]): string[] {
  const placeholders = parentUuids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT uuid FROM shopProduct WHERE parentUuid IN (${placeholders})`)
    .all(...parentUuids) as Array<{ uuid: string }>;
  return rows.map(r => r.uuid);
}

function getSalesSum(shopUuid: string, since: string, until: string, productUuids: string[]): number {
  if (productUuids.length === 0) return 0;
  const docs = db
    .prepare(
      `SELECT type, transactions FROM index_documents
       WHERE shop_id = ? AND close_date >= ? AND close_date <= ?
         AND type IN ('SELL', 'PAYBACK')`,
    )
    .all(shopUuid, since, until) as Array<{ type: string; transactions: string }>;

  let total = 0;
  const prodSet = new Set(productUuids);
  for (const doc of docs) {
    let txs: any[];
    try { txs = JSON.parse(doc.transactions); } catch { continue; }
    if (!Array.isArray(txs)) continue;
    for (const tx of txs) {
      if (tx.type !== "REGISTER_POSITION") continue;
      if (tx.commodityUuid && prodSet.has(tx.commodityUuid)) {
        total += doc.type === "SELL" ? (tx.sum ?? 0) : -(tx.sum ?? 0);
      }
    }
  }
  return Math.max(0, Math.round(total));
}

// UUID'ы товаров
const vapeUuids = getProductUuidsByParentUuids(VAPE_GROUP_UUIDS);
const accUuids = groupUuids.length > 0 ? getProductUuidsByParentUuids(groupUuids) : [];

const since = `${datePlan}T00:00:00`;
const until = `${datePlan}T23:59:59`;

// Создаём таблицу
db.exec(`
  CREATE TABLE IF NOT EXISTS salaryData (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    shopUuid TEXT NOT NULL,
    employeeUuid TEXT NOT NULL,
    bonusAccessories INTEGER NOT NULL,
    dataPlan INTEGER NOT NULL,
    salesDataVape INTEGER NOT NULL,
    bonusPlan INTEGER NOT NULL,
    totalBonus INTEGER NOT NULL,
    UNIQUE(date, shopUuid)
  )
`);

const insert = db.prepare(`
  INSERT OR REPLACE INTO salaryData
    (date, shopUuid, employeeUuid, bonusAccessories, dataPlan, salesDataVape, bonusPlan, totalBonus)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const session of sessions) {
  const shopUuid = session.shop_id;
  const employeeUuid = session.open_user_uuid;

  const salesDataAks = getSalesSum(shopUuid, since, until, accUuids);
  const salesDataVape = getSalesSum(shopUuid, since, until, vapeUuids);

  const bonusAccessories = Math.floor(salesDataAks * 0.05);
  const currentPlan = datPlan[shopUuid] ?? 0;
  const bonusPlan = salesDataVape >= currentPlan ? bonus : 0;

  insert.run(
    datePlan,
    shopUuid,
    employeeUuid,
    bonusAccessories,
    currentPlan,
    salesDataVape,
    bonusPlan,
    bonusAccessories + bonusPlan,
  );

  const shopName = (db.prepare("SELECT name FROM shops WHERE uuid = ?").get(shopUuid) as any)?.name || shopUuid;
  console.log(
    `  ${shopName}: план=${currentPlan} вейпы=${salesDataVape} акс=${salesDataAks} бонус=${bonusAccessories + bonusPlan}`,
  );
}

db.close();
console.log("✅ Готово.");
