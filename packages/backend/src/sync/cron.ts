import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { Evotor } from "../evotor";
import {
  formatDate,
  formatDateWithTime,
  createIndexDocumentsTable,
  saveNewIndexDocuments,
  getAllUuid,
  getUuidsByParentUuidList,
} from "../utils";
import {
  createProductsTableIfNotExists,
  createShopProductTable,
  createSalaryTable,
  delay,
  getPlan,
  getSalaryAndBonus,
  initializeSaleByPlanTable,
  saveSalaryData,
  updateOrInsertData,
  updateOrInsertDataS,
  updatePlan,
  updatePlanDb,
  upsertSaleByPlanData,
  createSellerDailyMetricsTable,
  upsertSellerDailyMetrics,
  createDeadStockCacheTable,
  refreshDeadStockCache,
} from "./db";

// ============================================================================
// Vape group UUIDs (shared across tasks)
// ============================================================================

export const VAPE_GROUP_UUIDS = [
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

interface SyncEnv {
  EVOTOR_API_TOKEN: string;
  DB: D1Database;
}

// ============================================================================
// Task: updateProducts
// ============================================================================

export async function updateProducts(env: SyncEnv): Promise<void> {
  const token = env.EVOTOR_API_TOKEN;
  const evo = new Evotor(token);

  await createProductsTableIfNotExists(env.DB);
  await createShopProductTable(env.DB);

  const shopUuids = await evo.getShopUuids();

  for (const shopUuid of shopUuids) {
    await delay(2000);
    console.log(`Fetching products for shop: ${shopUuid}`);
    const products = await evo.getProductsUuid(shopUuid);
    await updateOrInsertData(products, env.DB);

    // Also populate shopProduct table for frontend queries
    const productsFull = await evo.getProductsShopUuidsT(shopUuid);
    await updateOrInsertDataS(productsFull, env.DB);
  }

  console.log("Product update task completed");
}

// ============================================================================
// Task: updateProductsShope
// ============================================================================

export async function updateProductsShope(env: SyncEnv): Promise<void> {
  const token = env.EVOTOR_API_TOKEN;
  const evo = new Evotor(token);

  await createShopProductTable(env.DB);

  const shopUuids = await evo.getShopUuids();

  for (const shopUuid of shopUuids) {
    const products = await evo.getProductsShopUuidsT(shopUuid);
    await updateOrInsertDataS(products, env.DB);
    console.log(`Ensuring products table exists for shop: ${shopUuid}`);
  }
}

// ============================================================================
// Task: syncDocuments — синхронизация документов Эвотор → index_documents
// Алгоритм:
//   1. Проверяем пробелы за последние 90 дней и докачиваем недостающие дни
//   2. Всегда синхронизируем свежие документы за последние 24 часа
// ============================================================================

async function ensureDaysOfDocuments(
	evo: Evotor,
	db: D1Database,
	daysBack = 90,
): Promise<void> {
	const today = new Date();
	const startDate = new Date(today);
	startDate.setDate(today.getDate() - daysBack);

	const since = formatDateWithTime(startDate, false);
	const untilToday = formatDateWithTime(today, true);

	// Получаем все дни, за которые уже есть документы
	const existing = await db
		.prepare(`
			SELECT DISTINCT substr(close_date, 1, 10) as d
			FROM index_documents
			WHERE close_date >= ? AND close_date <= ?
		`)
		.bind(since, untilToday)
		.all<{ d: string }>();

	const existingDays = new Set((existing.results || []).map((r) => r.d));

	// Собираем диапазоны пропущенных дней
	const missingRanges: { since: Date; until: Date }[] = [];
	let rangeStart: Date | null = null;

	for (let i = 0; i <= daysBack; i++) {
		const d = new Date(today);
		d.setDate(d.getDate() - i);
		const dateStr = d.toISOString().slice(0, 10);

		if (!existingDays.has(dateStr)) {
			if (!rangeStart) rangeStart = new Date(d);
		} else if (rangeStart) {
			missingRanges.push({ since: new Date(rangeStart), until: new Date(d) });
			rangeStart = null;
		}
	}

	if (rangeStart) {
		// rangeStart — самый новый пропущенный день; пробел тянется до startDate
		missingRanges.push({ since: new Date(startDate), until: new Date(today) });
	}

	if (missingRanges.length === 0) {
		console.log(`[ensureDays] Пробелов нет, все ${daysBack} дней на месте`);
		return;
	}

	console.log(
		`[ensureDays] Найдено пробелов: ${missingRanges.length}. Заполняем...`,
	);

	const shops = await evo.getShopUuids();

	for (const range of missingRanges) {
		const sinceStr = formatDateWithTime(range.since, false);
		const untilStr = formatDateWithTime(range.until, true);

		const queries = shops.map((shopId) => ({
			shopId,
			since: sinceStr,
			until: untilStr,
		}));

		console.log(
			`[ensureDays] Загружаем ${sinceStr.slice(0, 10)} → ${untilStr.slice(0, 10)}...`,
		);

		const docs = await evo.getDocumentsIndexForShops(queries);
		console.log(
			`[ensureDays]   Получено ${docs.length} документов`,
		);

		await saveNewIndexDocuments(db, docs);
	}

	console.log("[ensureDays] Все пробелы заполнены");
}

export async function syncDocuments(env: SyncEnv): Promise<void> {
	const token = env.EVOTOR_API_TOKEN;
	const evo = new Evotor(token);

	await createIndexDocumentsTable(env.DB);

	// 1. Проверяем и заполняем пробелы за последние N дней
	await ensureDaysOfDocuments(evo, env.DB);

	// 2. Всегда синхронизируем свежие документы за последние 24 часа
	const now = new Date();
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);

	const shops = await evo.getShopUuids();
	const queries = shops.map((shopId) => ({
		shopId,
		since: formatDateWithTime(yesterday, false),
		until: formatDateWithTime(now, true),
	}));

	const newDocs = await evo.getDocumentsIndexForShops(queries);
	console.log(`[syncDocuments] Новых документов за 24ч: ${newDocs.length}`);

	await saveNewIndexDocuments(env.DB, newDocs);
	console.log("[syncDocuments] Синхронизация завершена");
}

// ============================================================================
// Task: syncStock — синхронизация остатков товаров Эвотор → D1
// ============================================================================

export async function syncStock(env: SyncEnv): Promise<void> {
  const token = env.EVOTOR_API_TOKEN;
  const evo = new Evotor(token);

  try {
    // Ensure stock table exists (detail table)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS stock (
        shop_id TEXT NOT NULL,
        product_uuid TEXT NOT NULL,
        product_name TEXT,
        quantity REAL DEFAULT 0,
        measure_name TEXT,
        purchase_price REAL,
        selling_price REAL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (shop_id, product_uuid)
      )
    `).run();

    const shops = await evo.getShopUuids();
    console.log(`[syncStock] Синхронизация остатков для ${shops.length} магазинов...`);

    for (const shopId of shops) {
      try {
        const items = (await evo.getStoreStock(shopId)) as any[];
        console.log(`[syncStock] Магазин ${shopId}: получено ${items.length} позиций`);

        if (!items || items.length === 0) continue;

        // Get shop name for stock table
        const shopRow = await env.DB.prepare(
          "SELECT name FROM shops WHERE uuid = ?"
        ).bind(shopId).first<{ name: string }>();
        const shopName = shopRow?.name || shopId;

        // Batch update both stock table and shopProduct.quantity
        const stockStmt = env.DB.prepare(`
          INSERT OR REPLACE INTO stock (shop_id, product_uuid, product_name, quantity, measure_name, purchase_price, selling_price, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
        `);

        const productStmt = env.DB.prepare(`
          UPDATE shopProduct SET quantity = ?1, price = ?2, measureName = ?3
          WHERE shopId = ?4 AND uuid = ?5
        `);

        const batch: D1PreparedStatement[] = [];

        for (const item of items) {
          const uuid = item.productUuid || item.uuid;
          const qty = item.quantity ?? 0;
          const price = item.sellingPrice ?? item.price ?? 0;
          const purchasePrice = item.purchasePrice ?? 0;
          const measureName = item.measureName || "шт";

          if (!uuid) continue;

          batch.push(stockStmt.bind(shopId, uuid, shopName, qty, measureName, purchasePrice, price));
          batch.push(productStmt.bind(qty, price, measureName, shopId, uuid));
        }

        if (batch.length > 0) {
          await env.DB.batch(batch);
          console.log(`[syncStock] Магазин ${shopId}: сохранено ${items.length} позиций`);
        }
      } catch (e) {
        console.error(`[syncStock] Ошибка для магазина ${shopId}:`, e);
      }
    }

    console.log("[syncStock] Синхронизация остатков завершена");
  } catch (error) {
    console.error("[syncStock] Ошибка:", error);
  }
}

// ============================================================================
// Task: syncShops — синхронизация магазинов Эвотор → shops
// ============================================================================

export async function syncShops(env: SyncEnv): Promise<void> {
  const token = env.EVOTOR_API_TOKEN;
  const evo = new Evotor(token);

  try {
    const { createShopsTable, upsertShops } = await import("./db.js");
    await createShopsTable(env.DB);
    const shops = await evo.getShops();
    const shopsData = Array.isArray(shops) ? shops.map((s: any) => ({
      uuid: s.uuid,
      name: s.name,
      address: s.address ?? "",
    })) : [];
    await upsertShops(env.DB, shopsData);
    console.log(`[syncShops] ${shopsData.length} магазинов синхронизировано`);
  } catch (e) {
    console.error("[syncShops] Ошибка:", e);
  }
}

// ============================================================================
// Task: syncEmployees — синхронизация сотрудников Эвотор → employees
// ============================================================================

export async function syncEmployees(env: SyncEnv): Promise<void> {
  const token = env.EVOTOR_API_TOKEN;
  const evo = new Evotor(token);

  try {
    const { createEmployeesTable, upsertEmployees } = await import("./db.js");
    await createEmployeesTable(env.DB);
    const employees = await evo.getEmployees();
    const employeesData = Array.isArray(employees) ? employees.map((e: any) => ({
      uuid: e.uuid,
      name: e.name ?? "",
      lastName: e.lastName ?? "",
      role: e.role ?? "",
      stores: e.stores ?? [],
    })) : [];
    await upsertEmployees(env.DB, employeesData);
    console.log(`[syncEmployees] ${employeesData.length} сотрудников синхронизировано`);
  } catch (e) {
    console.error("[syncEmployees] Ошибка:", e);
  }
}

// ============================================================================
// Task: getDocuments (external API — demossml.cc, устаревшая)
// ============================================================================

export async function getDocuments(_env: SyncEnv): Promise<void> {
  try {
    console.log("Fetching documents from API...");
    const response = await fetch("https://demossml.cc/api/documents", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Documents received:", data);
  } catch (error) {
    console.error("Error fetching documents:", error);
  }
}

// ============================================================================
// Task: updatePlan_ — calculate and persist sales plan for Vape groups
// ============================================================================

export async function updatePlan_(env: SyncEnv): Promise<void> {
  try {
    const token = env.EVOTOR_API_TOKEN;
    const evo = new Evotor(token);
    const date = new Date();
    const datePlan: string = formatDate(date);

    console.log("Старт функции updatePlan");
    console.log(`Дата для плана: ${datePlan}`);

    const productUuids = await getUuidsByParentUuidList(env.DB, VAPE_GROUP_UUIDS);
    console.log(`Получены UUID товаров: ${productUuids.length} шт.`);

    const datPlan = await evo.getPlan(date, productUuids);
    console.log(`Получено записей плана: ${Object.keys(datPlan).length}`);

    await updatePlanDb(datPlan, datePlan, env.DB);
    console.log("Обновление базы данных плана завершено успешно");
  } catch (error) {
    console.error("Ошибка в функции updatePlan:", error);
  }
}

// ============================================================================
// Task: getDataForCurrentDate — salary and bonus calculation
// ============================================================================

export async function getDataForCurrentDate(env: SyncEnv): Promise<void> {
  try {
    const date = new Date();
    date.setDate(date.getDate() - 1);

    const datePlan: string = formatDate(date);
    const sincetDate = formatDateWithTime(date, false);
    const untilDate = formatDateWithTime(date, true);

    const { getOpenSessionsFromD1, getProductsByGroupFromD1, getSalesSumFromD1 } = await import("../evotor/utils.js");

    const groupIdsAks = await getAllUuid(env.DB);
    console.log("Accessories UUIDs:", groupIdsAks);

    // D1: открытые смены из index_documents
    const docOpenSessions = await getOpenSessionsFromD1(env.DB, sincetDate, untilDate);
    const salaryAndBonus = await getSalaryAndBonus(datePlan, env.DB);
    console.log("Salary and bonus:", salaryAndBonus);

    for (const doc of docOpenSessions) {
      await delay(7000);

      const openShopUuid = doc.storeUuid;
      const employeeUuid = doc.openUserUuid;

      const productUuids = await getUuidsByParentUuidList(
        env.DB,
        VAPE_GROUP_UUIDS,
      );

      // D1: план из таблицы plan
      let plan = await getPlan(datePlan, env.DB);
      let datPlan: Record<string, number> = {};

      if (!plan) {
        console.warn(`[salary] План на ${datePlan} отсутствует в D1, пропускаем`);
        continue;
      } else {
        datPlan = plan;
      }

      // D1: продажи аксессуаров
      let salesDataAks = 0;
      if (groupIdsAks.length > 0) {
        const porodUuidAks = await getProductsByGroupFromD1(env.DB, groupIdsAks);
        salesDataAks = await getSalesSumFromD1(
          env.DB, openShopUuid, sincetDate, untilDate, porodUuidAks
        );
        console.log("Accessories sales:", salesDataAks);
      }

      const bonusAccessories = Math.floor(salesDataAks * 0.05);

      // D1: продажи vape
      const porodUuidVape = await getProductsByGroupFromD1(env.DB, VAPE_GROUP_UUIDS);
      const salesDataVape = await getSalesSumFromD1(
        env.DB, openShopUuid, sincetDate, untilDate, porodUuidVape
      );

      const bonus = salaryAndBonus?.bonus || 0;
      const currentPlan = datPlan[openShopUuid] ?? 0;
      const bonusPlan = salesDataVape >= currentPlan ? Number(bonus) : 0;

      const dataReport = {
        date: datePlan,
        shopUuid: openShopUuid,
        employeeUuid: employeeUuid,
        bonusAccessories: bonusAccessories,
        dataPlan: currentPlan,
        salesDataVape: salesDataVape,
        bonusPlan: bonusPlan,
        totalBonus: bonusAccessories + bonusPlan,
      };
      console.log("Salary report:", dataReport);

      await createSalaryTable(env.DB);
      await saveSalaryData(env.DB, dataReport);
    }
  } catch (error) {
    console.error("Error in getDataForCurrentDate:", error);
  }
}

// ============================================================================
// Task: updateDataSaleByPlan — sales data per plan (not in cron, exported)
// ============================================================================

export async function updateDataSaleByPlan(env: SyncEnv): Promise<void> {
  await initializeSaleByPlanTable(env.DB);

  const newDate = new Date();
  const datePlan = formatDate(newDate);
  const since = formatDateWithTime(newDate, false);
  const until = formatDateWithTime(newDate, true);

  console.log("Initialized dates:", { datePlan, since, until });

  const productUuids = await getUuidsByParentUuidList(env.DB, VAPE_GROUP_UUIDS);

  // D1: план из таблицы plan
  let plan = await getPlan(datePlan, env.DB);
  let datPlan: Record<string, number> = {};

  if (!plan) {
    console.log("No existing plan found in D1, trying to fetch from Evotor...");
    const token = env.EVOTOR_API_TOKEN;
    const evo = new Evotor(token);
    datPlan = await evo.getPlan(newDate, productUuids);
    console.log("Fetched new plan from Evotor:", datPlan);
    await updatePlan(datPlan, datePlan, env.DB);
  } else {
    datPlan = plan;
  }

  // D1: список магазинов
  const { getShopUuidsFromDB, getShopNameFromDB } = await import("./db.js");
  const shopUuids = await getShopUuidsFromDB(env.DB);

  const { getProductsByGroupFromD1, getSalesSumFromD1 } = await import("../evotor/utils.js");

  const salesData: Record<
    string,
    {
      date: string;
      datePlan: number;
      dataSales: number;
      dataQuantity: Record<string, number>;
    }
  > = {};

  for (const shopId of shopUuids) {
    try {
      const productUuids = await getProductsByGroupFromD1(env.DB, VAPE_GROUP_UUIDS);
      const shopName = await getShopNameFromDB(env.DB, shopId);

      const sumSalesData = await getSalesSumFromD1(env.DB, shopId, since, until, productUuids);
      // quantity: aggregate from index_documents
      const productSet = new Set(productUuids);
      const quantityResult = await env.DB
        .prepare(
          `SELECT transactions FROM index_documents
           WHERE shop_id = ? AND close_date >= ? AND close_date <= ?
             AND type IN ('SELL', 'PAYBACK')`
        )
        .bind(shopId, since, until)
        .all<{ transactions: string }>();

      const podQuantity: Record<string, number> = {};
      for (const row of quantityResult.results ?? []) {
        try {
          const txs = JSON.parse(row.transactions);
          if (!Array.isArray(txs)) continue;
          for (const tx of txs) {
            if (
              tx.type === "REGISTER_POSITION" &&
              tx.commodityUuid &&
              productSet.has(tx.commodityUuid)
            ) {
              const name = tx.commodityName || "—";
              podQuantity[name] = (podQuantity[name] || 0) + (tx.quantity || 0);
            }
          }
        } catch { /* skip */ }
      }

      salesData[shopName] = {
        date: datePlan,
        datePlan: datPlan[shopId],
        dataSales: sumSalesData,
        dataQuantity: podQuantity,
      };

      await upsertSaleByPlanData(env.DB, salesData);
    } catch (err) {
      console.error(
        `Error when retrieving data for the store ${shopId}:`,
        err,
      );
    }
  }

  console.log("Final sales data:", salesData);
}

// ──────────────────────────────────────────────
// Telegram alert for critical sellers
// ──────────────────────────────────────────────

export async function checkAndSendCriticalAlerts(
  env: SyncEnv & { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_ALERT_CHAT_ID?: string },
): Promise<void> {
  const token = (env as any).TELEGRAM_BOT_TOKEN || (env as any).BOT_TOKEN;
  const chatId = (env as any).TELEGRAM_ALERT_CHAT_ID;
  const db = env.DB;

  if (!token || !chatId) {
    console.log("[alerts] Telegram not configured, skipping");
    return;
  }

  try {
    const { computeSellerEffectiveness } = await import("../services/sellerEffectiveness.js");
    const { sendCriticalAlerts } = await import("../services/telegramAlerts.js");

    const result = await computeSellerEffectiveness(db, { period: 14 });

    const criticalSellers = result.sellers
      .filter((s) => s.riskLevel === "critical")
      .map((s) => ({
        name: s.name,
        daysBelow: 3,
        planCompletion: null as number | null,
        trendSlope: s.trendSlope,
        store: s.stores[0]?.store ?? "неизвестно",
      }));

    if (criticalSellers.length > 0) {
      await sendCriticalAlerts({ botToken: token, chatId }, criticalSellers);
      console.log(`[alerts] Sent ${criticalSellers.length} critical alerts`);
    } else {
      console.log("[alerts] No critical sellers");
    }
  } catch (err: any) {
    console.error("[alerts] Error:", err.message);
  }
}

// ============================================================================
// Task: aggregateSellerDailyMetrics
//
// Runs nightly. Aggregates yesterday's SELL documents from index_documents
// into seller_daily_metrics for fast queries by computeSellerAdvancedStats.
// ============================================================================

export async function aggregateSellerDailyMetrics(env: SyncEnv): Promise<void> {
  try {
    // 1. Ensure target table exists
    await createSellerDailyMetricsTable(env.DB);

    // 2. Determine yesterday (UTC → MSK date string)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const since = dateStr;
    const until = dateStr + "T23:59:59";

    // 3. Fetch SELL docs for yesterday
    const docs = await env.DB
      .prepare(
        `SELECT shop_id, close_date, open_user_uuid, transactions
         FROM index_documents
         WHERE type = 'SELL'
           AND close_date >= ? AND close_date <= ?`,
      )
      .bind(since, until)
      .all<{
        shop_id: string;
        close_date: string;
        open_user_uuid: string;
        transactions: string;
      }>();

    const sellDocs = docs.results ?? [];
    console.log(
      `[aggregateSellerDailyMetrics] ${dateStr}: ${sellDocs.length} SELL documents`,
    );

    if (sellDocs.length === 0) {
      console.log("[aggregateSellerDailyMetrics] No data, skipping.");
      return;
    }

    // 4. Fetch OPEN_SESSION docs for shift hours
    const sessions = await env.DB
      .prepare(
        `SELECT shop_id, open_user_uuid, close_date
         FROM index_documents
         WHERE type = 'OPEN_SESSION'
           AND close_date >= ? AND close_date <= ?`,
      )
      .bind(since, until)
      .all<{
        shop_id: string;
        open_user_uuid: string;
        close_date: string;
      }>();

    const sessionMap = new Map<string, { openTime: string; closeTime: string }[]>();
    for (const r of sessions.results ?? []) {
      const key = `${r.open_user_uuid}|${r.close_date.slice(0, 10)}`;
      if (!sessionMap.has(key)) sessionMap.set(key, []);
      sessionMap.get(key)!.push({
        openTime: r.close_date,
        closeTime: r.close_date,
      });
    }

    // 5. Fetch employee names
    const empRows = await env.DB
      .prepare("SELECT uuid, name FROM employees")
      .all<{ uuid: string; name: string }>();
    const empNames: Record<string, string> = {};
    for (const r of empRows.results ?? []) empNames[r.uuid] = r.name;

    // 6. Build category map (vape + accessories)
    const categoryMap = new Map<string, string>();

    const vapePlaceholders = VAPE_GROUP_UUIDS.map(() => "?").join(",");
    const vapeRows = await env.DB
      .prepare(
        `SELECT uuid FROM shopProduct WHERE parentUuid IN (${vapePlaceholders})`,
      )
      .bind(...VAPE_GROUP_UUIDS)
      .all<{ uuid: string }>();
    for (const r of vapeRows.results ?? []) categoryMap.set(r.uuid, "vape");

    try {
      const accParents = await env.DB
        .prepare("SELECT uuid FROM accessories")
        .all<{ uuid: string }>();
      const parentUuids = (accParents.results ?? []).map((r) => r.uuid);
      if (parentUuids.length > 0) {
        const accPlaceholders = parentUuids.map(() => "?").join(",");
        const accRows = await env.DB
          .prepare(
            `SELECT uuid FROM shopProduct WHERE parentUuid IN (${accPlaceholders})`,
          )
          .bind(...parentUuids)
          .all<{ uuid: string }>();
        for (const r of accRows.results ?? []) {
          if (!categoryMap.has(r.uuid)) categoryMap.set(r.uuid, "accessory");
        }
      }
    } catch {
      // accessories table may not exist
    }

    // 7. Aggregate per (seller_uuid, shop_id)
    const agg = new Map<
      string,
      {
        revenue: number;
        checks: number;
        accRevenue: number;
        vapeRevenue: number;
        discountChecks: number;
        discountAmount: number;
        firstCheckTs: string | null;
        checkTimestamps: string[];  // для absent-slots
      }
    >();

    for (const doc of sellDocs) {
      const uuid = doc.open_user_uuid || "unknown";
      const shopId = doc.shop_id || "unknown";
      const key = `${uuid}|${shopId}`;

      if (!agg.has(key)) {
        agg.set(key, {
          revenue: 0,
          checks: 0,
          accRevenue: 0,
          vapeRevenue: 0,
          discountChecks: 0,
          discountAmount: 0,
          firstCheckTs: null,
          checkTimestamps: [],
        });
      }
      const entry = agg.get(key)!;
      entry.checkTimestamps.push(doc.close_date);

      let txs: any[];
      try {
        txs = JSON.parse(doc.transactions);
      } catch {
        continue;
      }
      if (!Array.isArray(txs)) continue;

      let checkRevenue = 0;
      let hasDiscount = false;
      let discAmount = 0;

      for (const tx of txs) {
        if (tx.type === "REGISTER_POSITION" && tx.commodityUuid) {
          const cat = categoryMap.get(tx.commodityUuid) ?? "other";
          const amt = tx.resultSum ?? tx.sum ?? 0;
          if (cat === "vape") entry.vapeRevenue += amt;
          if (cat === "accessory") entry.accRevenue += amt;
          const d = tx.discount ?? tx.discountSum ?? 0;
          if (d > 0) {
            hasDiscount = true;
            discAmount += d;
          }
        }
        if (tx.type === "DISCOUNT" && (tx.sum ?? 0) > 0) {
          hasDiscount = true;
          discAmount += tx.sum ?? 0;
        }
        if (tx.type === "PAYMENT" && tx.sum > 0) {
          checkRevenue += tx.sum;
        } else if (tx.type === "REFUND" && tx.sum > 0) {
          checkRevenue -= tx.sum;
        }
      }

      entry.revenue += checkRevenue;
      entry.checks += 1;
      if (hasDiscount) {
        entry.discountChecks += 1;
        entry.discountAmount += discAmount;
      }
      if (!entry.firstCheckTs || doc.close_date < entry.firstCheckTs) {
        entry.firstCheckTs = doc.close_date;
      }
    }

    // 8. Compute shift hours per uuid AND first_check_delay
    const shiftHoursMap = new Map<string, number>();
    const shiftOpenMap = new Map<string, string>(); // uuid → earliest OPEN_SESSION time
    for (const [sessKey, sessList] of sessionMap) {
      const [uuid] = sessKey.split("|");
      const timestamps = sessList.map((s) => s.openTime).sort();
      if (!shiftOpenMap.has(uuid) || timestamps[0] < shiftOpenMap.get(uuid)!) {
        shiftOpenMap.set(uuid, timestamps[0]);
      }
      let hours = 0;
      if (timestamps.length >= 2) {
        const a = new Date(
          timestamps[0] + (timestamps[0].includes("T") ? "" : "T00:00:00") + "+03:00",
        );
        const b = new Date(
          timestamps[timestamps.length - 1] +
            (timestamps[timestamps.length - 1].includes("T") ? "" : "T00:00:00") +
            "+03:00",
        );
        hours = Math.max(0, (b.getTime() - a.getTime()) / 3600000);
      } else {
        hours = 8;
      }
      shiftHoursMap.set(uuid, hours);
    }

    // --- Helper: parse ISO timestamp → minute-of-day ---
    const isoTimeToMin = (iso: string): number => {
      // "2026-07-07T04:40:55.000+0000" → hour*60+min
      const t = iso.slice(11, 16); // "04:40"
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    // --- Helper: compute absent slots for a seller-shop ---
    const LUNCH_START = 12 * 60;      // 12:00
    const LUNCH_END = 13 * 60;        // 13:00
    const SLOT_MINUTES = 15;

    const computeAbsentSlots = (
      checkTimestamps: string[],
      shiftOpenMin: number,
      shiftCloseMin: number,
    ): { slots: { from: string; to: string; minutes: number; probability: number }[]; overallProb: number } => {
      if (checkTimestamps.length === 0 || shiftCloseMin <= shiftOpenMin) {
        return { slots: [], overallProb: 0 };
      }

      // Build set of occupied 15-min slots
      const occupiedSlots = new Set<number>();
      for (const ts of checkTimestamps) {
        const m = isoTimeToMin(ts);
        const slot = Math.floor(m / SLOT_MINUTES) * SLOT_MINUTES;
        occupiedSlots.add(slot);
      }

      // Scan shift window for absent slots
      const absentSlots: { fromMin: number; toMin: number }[] = [];
      let gapStart: number | null = null;

      for (let m = shiftOpenMin; m < shiftCloseMin; m += SLOT_MINUTES) {
        // Skip lunch break
        if (m >= LUNCH_START && m < LUNCH_END) {
          if (gapStart != null) {
            absentSlots.push({ fromMin: gapStart, toMin: m });
            gapStart = null;
          }
          continue;
        }

        const slotKey = Math.floor(m / SLOT_MINUTES) * SLOT_MINUTES;
        if (!occupiedSlots.has(slotKey)) {
          if (gapStart === null) gapStart = m;
        } else {
          if (gapStart !== null) {
            absentSlots.push({ fromMin: gapStart, toMin: m });
            gapStart = null;
          }
        }
      }
      if (gapStart !== null) {
        absentSlots.push({ fromMin: gapStart, toMin: shiftCloseMin });
      }

      // Merge adjacent slots, compute probability for long slots
      const minToHHMM = (m: number) => {
        const hh = Math.floor(m / 60).toString().padStart(2, "0");
        const mm = (m % 60).toString().padStart(2, "0");
        return `${hh}:${mm}`;
      };

      const result: { from: string; to: string; minutes: number; probability: number }[] = [];
      let maxProb = 0;

      for (const slot of absentSlots) {
        const dur = slot.toMin - slot.fromMin;
        if (dur < SLOT_MINUTES) continue;
        // Probability: linear from 0 at 0 min to 1 at 120 min
        const prob = Math.min(1, Math.round((dur / 120) * 100) / 100);
        if (prob > maxProb) maxProb = prob;
        result.push({
          from: minToHHMM(slot.fromMin),
          to: minToHHMM(slot.toMin),
          minutes: dur,
          probability: prob,
        });
      }

      return { slots: result, overallProb: maxProb };
    };

    // 9. Build rows
    const rows: {
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
      first_check_delay: number;
      absent_slots: string;
      absent_probability: number;
    }[] = [];

    for (const [key, entry] of agg) {
      const [uuid, shopId] = key.split("|");

      // first_check_delay: shift open → first check
      const shiftOpen = shiftOpenMap.get(uuid);
      let firstCheckDelay = 0;
      if (shiftOpen && entry.firstCheckTs) {
        const openMin = isoTimeToMin(shiftOpen);
        const firstMin = isoTimeToMin(entry.firstCheckTs);
        firstCheckDelay = Math.max(0, firstMin - openMin);
      }

      // absent_slots: gaps between checks
      const shiftCloseMin = shiftOpen
        ? isoTimeToMin(shiftOpen) + (shiftHoursMap.get(uuid) ?? 8) * 60
        : 22 * 60; // default 22:00
      const shiftOpenMin = shiftOpen ? isoTimeToMin(shiftOpen) : 9 * 60;
      const { slots: absentSlots, overallProb } = computeAbsentSlots(
        entry.checkTimestamps.sort(),
        shiftOpenMin,
        Math.min(shiftCloseMin, 23 * 60 + 59),
      );

      rows.push({
        date: dateStr,
        seller_uuid: uuid,
        seller_name: empNames[uuid] || uuid.slice(0, 8),
        shop_id: shopId,
        revenue: Math.round(entry.revenue),
        checks: entry.checks,
        acc_revenue: Math.round(entry.accRevenue),
        vape_revenue: Math.round(entry.vapeRevenue),
        discount_checks: entry.discountChecks,
        discount_amount: Math.round(entry.discountAmount),
        shift_hours: parseFloat((shiftHoursMap.get(uuid) ?? 8).toFixed(1)),
        first_check_ts: entry.firstCheckTs,
        first_check_delay: firstCheckDelay,
        absent_slots: JSON.stringify(absentSlots),
        absent_probability: overallProb,
      });
    }

    // 10. Upsert
    await upsertSellerDailyMetrics(env.DB, rows);
    console.log(
      `[aggregateSellerDailyMetrics] Done: ${rows.length} seller-day rows for ${dateStr}`,
    );
  } catch (err: any) {
    console.error(
      "[aggregateSellerDailyMetrics] Error:",
      err.message,
      err.stack,
    );
  }
}

// ============================================================================
// Task: checkPlanLagAndAlert
//
// Проверяет текущее выполнение плана продавцами.
// Если planCompletion < 80% — отправляет уведомление в Telegram.
// ============================================================================

export async function checkPlanLagAndAlert(env: SyncEnv): Promise<void> {
  const token = (env as any).TELEGRAM_BOT_TOKEN || (env as any).BOT_TOKEN;
  const chatId = (env as any).TELEGRAM_ALERT_CHAT_ID;

  if (!token || !chatId) {
    console.log("[plan-lag] Telegram not configured, skipping");
    return;
  }

  try {
    const { computeSellerEffectiveness } = await import("../services/sellerEffectiveness.js");
    const { sendPlanLagAlerts } = await import("../services/telegramAlerts.js");

    // Plan completion is not available in the current SellerMetrics;
    // this check requires plan data that's no longer computed.
    console.log("[plan-lag] Plan completion data not available — skipping check");
  } catch (err: any) {
    console.error("[plan-lag] Error:", err.message);
  }
}

// ============================================================================
// Task: sendDailyTopSellers
//
// Ежедневный топ-3 продавцов по выручке → Telegram.
// ============================================================================

export async function sendDailyTopSellers(env: SyncEnv): Promise<void> {
  const token = (env as any).TELEGRAM_BOT_TOKEN || (env as any).BOT_TOKEN;
  const chatId = (env as any).TELEGRAM_ALERT_CHAT_ID;

  if (!token || !chatId) {
    console.log("[top-sellers] Telegram not configured, skipping");
    return;
  }

  try {
    const { computeSellerEffectiveness } = await import("../services/sellerEffectiveness.js");
    const { sendTopSellers } = await import("../services/telegramAlerts.js");

    const result = await computeSellerEffectiveness(env.DB, { period: 1 });

    const top3 = result.sellers
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 3)
      .map((s, i) => ({
        rank: i + 1,
        name: s.name,
        revenue: s.totalRevenue,
        avgCheck: s.avgCheck,
        store: s.stores[0]?.store ?? "неизвестно",
      }));

    if (top3.length > 0) {
      await sendTopSellers({ botToken: token, chatId }, top3);
      console.log(`[top-sellers] Sent daily top-${top3.length}`);
    }
  } catch (err: any) {
    console.error("[top-sellers] Error:", err.message);
  }
}

// Task: refreshDeadStockCache — ночное обновление кэша мёртвых остатков
export async function refreshDeadStockTask(env: SyncEnv): Promise<void> {
  try {
    console.log("[dead-stock-cache] Начало обновления кэша...");
    await createDeadStockCacheTable(env.DB);
    const count = await refreshDeadStockCache(env.DB);
    console.log(`[dead-stock-cache] Обновлено ${count} записей`);
  } catch (err: any) {
    console.error("[dead-stock-cache] Error:", err.message);
  }
}
