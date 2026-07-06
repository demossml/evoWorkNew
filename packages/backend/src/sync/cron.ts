import type { D1Database } from "@cloudflare/workers-types";
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
} from "./db";

// ============================================================================
// Vape group UUIDs (shared across tasks)
// ============================================================================

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
	daysBack = 30,
): Promise<void> {
	const today = new Date();
	const startDate = new Date(today);
	startDate.setDate(today.getDate() - daysBack);

	const since = formatDateWithTime(startDate, false);
	const untilToday = formatDateWithTime(today, true);

	// Получаем все дни, за которые уже есть документы
	const existing = await db
		.prepare(`
			SELECT DISTINCT date(close_date) as d
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
		missingRanges.push({ since: new Date(rangeStart), until: new Date(today) });
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
    // Ensure stock table exists
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
        // Future: insert stock data into D1 table
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
    const token = env.EVOTOR_API_TOKEN;
    const evo = new Evotor(token);

    const date = new Date();
    date.setDate(date.getDate() - 1);

    const datePlan: string = formatDate(date);
    const sincetDate = formatDateWithTime(date, false);
    const untilDate = formatDateWithTime(date, true);

    const groupIdsAks = await getAllUuid(env.DB);
    console.log("Accessories UUIDs:", groupIdsAks);

    const docOpenSessions = await evo.getAllOpenSessions(sincetDate, untilDate);
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

      let plan = await getPlan(datePlan, env.DB);
      let datPlan: Record<string, number> = {};

      if (!plan) {
        datPlan = await evo.getPlan(date, productUuids);
        await updatePlanDb(datPlan, datePlan, env.DB);
      } else {
        datPlan = plan;
      }

      // Accessories sales
      const porodUuidAks = await evo.getProductsByGroup(
        openShopUuid,
        groupIdsAks,
      );
      const salesDataAks = await evo.getSalesSum(
        openShopUuid,
        sincetDate,
        untilDate,
        porodUuidAks,
      );
      console.log("Accessories sales:", salesDataAks);

      const bonusAccessories = Math.floor(salesDataAks * 0.05);

      // Vape sales
      const porodUuidVape = await evo.getProductsByGroup(
        openShopUuid,
        VAPE_GROUP_UUIDS,
      );
      const salesDataVape = await evo.getSalesSum(
        openShopUuid,
        sincetDate,
        untilDate,
        porodUuidVape,
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
  const token = env.EVOTOR_API_TOKEN;
  const evo = new Evotor(token);

  await initializeSaleByPlanTable(env.DB);

  const newDate = new Date();
  const datePlan = formatDate(newDate);
  const since = formatDateWithTime(newDate, false);
  const until = formatDateWithTime(newDate, true);

  console.log("Initialized dates:", { datePlan, since, until });

  const productUuids = await getUuidsByParentUuidList(env.DB, VAPE_GROUP_UUIDS);

  let plan = await getPlan(datePlan, env.DB);
  let datPlan: Record<string, number> = {};

  if (!plan) {
    console.log("No existing plan found, fetching new plan...");
    datPlan = await evo.getPlan(newDate, productUuids);
    console.log("Fetched new plan:", datPlan);
    await updatePlan(datPlan, datePlan, env.DB);
  } else {
    datPlan = plan;
  }

  const shopUuids = await evo.getShopUuids();

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
      const productUuids = await evo.getProductsByGroup(shopId, VAPE_GROUP_UUIDS);
      const shopName = await evo.getShopName(shopId);

      const [sumSalesData, podQuantity] = await Promise.all([
        evo.getSalesSum(shopId, since, until, productUuids),
        evo.getSalesSumQuantity(shopId, since, until, productUuids),
      ]);

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
