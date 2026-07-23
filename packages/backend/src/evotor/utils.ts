import {
	getDocumentsByCashOutcomeByPeriod,
	getDocumentsBySales,
	getDocumentsBySalesPeriod,
} from "../utils";
import { VAPE_GROUP_UUIDS } from "../sync/cron";

import type { D1Database } from "@cloudflare/workers-types";

/**
 * Получает данные по выплатам в магазине с разбивкой по категориям.
 *
 * @param {string[]} shopUuids - Список UUID магазинов.
 * @param {string} since - Начальная дата (в формате строки).
 * @param {string} until - Конечная дата (в формате строки).
 *
 * @returns {Promise<Record<string, Record<string, number>>>} - Данные по выплатам для каждого магазина с разбивкой по категориям.
 *
 * @throws {Error} - В случае ошибки при получении данных.
 */
export async function getDocumentsByCashOutcomeData(
	db: D1Database,
	shopUuids: string[],
	since: string,
	until: string,
): Promise<Record<string, Record<string, number>>> {
	const paymentCategory: Record<number, string> = {
		1: "Инкассация",
		2: "Оплата поставщику",
		3: "Оплата услуг",
		4: "Аренда",
		5: "Заработная плата",
		6: "Прочее",
	};

	// Используем p-limit для ограничения количества параллельных запросов, например 5 одновременно
	const pLimit = (await import("p-limit")).default;
	const limit = pLimit(5);

	const results = await Promise.all(
		shopUuids.map((shopUuid) =>
			limit(async () => {
				const { getShopNameFromDB } = await import("../sync/db.js");
				const [shopName, cashOutcomeDocuments] = await Promise.all([
					getShopNameFromDB(db, shopUuid),
					getDocumentsByCashOutcomeByPeriod(db, shopUuid, since, until),
				]);

				const sumPaymentCategory: Record<string, number> = {};

				for (const doc of cashOutcomeDocuments) {
					for (const trans of doc.transactions) {
						if (trans.type === "CASH_OUTCOME") {
							const category = paymentCategory[trans.paymentCategoryId];
							if (category) {
								sumPaymentCategory[category] =
									(sumPaymentCategory[category] || 0) + trans.sum;
							}
						}
					}
				}

				return { shopName, sumPaymentCategory };
			}),
		),
	);

	const resultData: Record<string, Record<string, number>> = {};
	for (const { shopName, sumPaymentCategory } of results) {
		resultData[shopName] = sumPaymentCategory;
	}

	return resultData;
}

export async function getSalesgardenReportData(
	db: D1Database,
	shopUuids: string[],
	since: string,
	until: string,
): Promise<{
	salesDataByShopName: Record<
		string,
		{
			sell: Record<string, number>;
			refund: Record<string, number>;
			totalSell: number;
		}
	>;
	grandTotalSell: number;
	grandTotalRefund: number;
	/**
	 * Выручка по дням (YYYY-MM-DD → сумма продаж), просуммированная по всем
	 * переданным магазинам. Строится из той же выборки документов, что и
	 * grandTotalSell — просто не схлопывается в одно число, а группируется
	 * по close_date. Нужно для спарклайнов/трендов на дашборде.
	 */
	dailySell: Record<string, number>;
}> {
	const paymentTypeLabels: Record<string, string> = {
		CARD: "Банковской картой:",
		ADVANCE: "Предоплатой (зачетом аванса):",
		CASH: "Нал. средствами:",
		COUNTEROFFER: "Встречным предоставлением:",
		CREDIT: "Постоплатой (в кредит):",
		ELECTRON: "Безналичными средствами:",
		UNKNOWN: "Неизвестно. По-умолчанию:",
	};

	try {
		// Параллельно получаем документы и имена магазинов
		const { getShopNameFromDB } = await import("../sync/db.js");
		const [documentsByShop, shopNames] = await Promise.all([
			Promise.all(
				shopUuids.map(async (uuid) => ({
					uuid,
					docs: await getDocumentsBySalesPeriod(db, uuid, since, until),
				})),
			),
			Promise.all(shopUuids.map((uuid) => getShopNameFromDB(db, uuid))),
		]);

		// Создаем мапу uuid => имя магазина
		const shopNameMap = Object.fromEntries(
			shopUuids.map((uuid, i) => [uuid, shopNames[i]]),
		);

		const salesDataByShopName: Record<
			string,
			{
				sell: Record<string, number>;
				refund: Record<string, number>;
				totalSell: number;
			}
		> = {};

		let grandTotalSell = 0;
		let grandTotalRefund = 0;
		const dailySellMap = new Map<string, number>();

		for (const { uuid, docs } of documentsByShop) {
			const sellMap = new Map<string, number>();
			const refundMap = new Map<string, number>();
			let totalSell = 0;
			let totalRefund = 0;

			for (const { type: docType, transactions, closeDate } of docs) {
				const isRefund = docType === "PAYBACK";
				const targetMap = isRefund ? refundMap : sellMap;
				const day = closeDate.slice(0, 10); // "YYYY-MM-DD" из "YYYY-MM-DD HH:mm:ss"

				for (const { type, paymentType, sum } of transactions) {
					if (type !== "PAYMENT" || !paymentType) continue;
					const label =
						paymentTypeLabels[paymentType] || paymentTypeLabels.UNKNOWN;
					targetMap.set(label, (targetMap.get(label) ?? 0) + sum);
					if (isRefund) {
						totalRefund += sum;
					} else {
						totalSell += sum;
						dailySellMap.set(day, (dailySellMap.get(day) ?? 0) + sum);
					}
				}
			}

			const shopName = shopNameMap[uuid] || uuid;
			salesDataByShopName[shopName] = {
				sell: Object.fromEntries(sellMap),
				refund: Object.fromEntries(refundMap),
				totalSell,
			};
			grandTotalSell += totalSell;
			grandTotalRefund += totalRefund;
		}

		return {
			salesDataByShopName,
			grandTotalSell,
			grandTotalRefund,
			dailySell: Object.fromEntries(dailySellMap),
		};
	} catch (error) {
		console.error(
			`getSalesgardenReportData: Ошибка при получении данных для магазинов ${shopUuids.join(", ")}`,
			error,
		);
		throw error;
	}
}

interface ChartPoint {
	time: string; // ISO-строка времени (с +3 часами)
	value: number; // сумма продаж
}

interface ShopChartData {
	shopName: string;
	data: ChartPoint[];
}

export async function getSalesDataG(
	db: D1Database,
	shopUuids: string[],
	since: string,
	until: string,
): Promise<ShopChartData[]> {
	try {
		// console.log("⏳ Запрос данных о продажах...");
		// console.log(`🛍 Магазины: ${shopUuids.join(", ")}`);
		// console.log(`📅 Период: с ${since} по ${until}`);

		// Параллельно получаем документы и названия магазинов
		const { getShopNameFromDB } = await import("../sync/db.js");
		const [documentsByShop, shopNames] = await Promise.all([
			Promise.all(
				shopUuids.map(async (uuid) => {
					const docs = await getDocumentsBySales(db, uuid, since, until);
					console.log(
						`📄 Получено ${docs.length} документов для магазина ${uuid}`,
					);
					// Логируем структуру первого документа для отладки
					// if (docs.length > 0) {
					// 	console.log(
					// 		`📝 Структура первого документа: ${JSON.stringify(docs[0], null, 2)}`,
					// 	);
					// }
					return docs;
				}),
			),
			Promise.all(
				shopUuids.map(async (uuid) => {
					const name = await getShopNameFromDB(db, uuid);
					// console.log(`🏪 Название магазина ${uuid}: ${name || "Неизвестно"}`);
					return name || `Магазин ${uuid}`; // Запасное имя
				}),
			),
		]);

		const chartData: ShopChartData[] = [];

		for (let i = 0; i < shopUuids.length; i++) {
			const shopName = shopNames[i];
			const docs = documentsByShop[i] || []; // Защита от undefined

			// console.log(`📊 Обработка ${docs.length} документов для "${shopName}"`);

			const data: ChartPoint[] = docs
				.map((doc: any, index: number) => {
					// Проверка наличия документа
					if (!doc) {
						console.warn(
							`⚠️ Пропущен документ ${index + 1} для "${shopName}" — документ отсутствует`,
						);
						return null;
					}

					// Используем closeDate как основное поле для времени
					const timestamp = doc.closeDate;
					if (!timestamp) {
						console.warn(
							`⚠️ Пропущен документ ${index + 1} для "${shopName}" — отсутствует closeDate`,
						);
						return null;
					}

					const originalDate = new Date(timestamp);
					// Проверка валидности даты
					if (originalDate.toString() === "Invalid Date") {
						console.warn(
							`⚠️ Пропущен документ ${index + 1} для "${shopName}" — некорректная дата: ${timestamp}`,
						);
						return null;
					}

					// Поиск транзакции DOCUMENT_CLOSE_FPRINT для получения total
					const closeFprint = doc.transactions?.find(
						(tx: any) => tx.type === "DOCUMENT_CLOSE_FPRINT",
					);
					if (
						!closeFprint ||
						typeof closeFprint.total !== "number" ||
						Number.isNaN(closeFprint.total)
					) {
						console.warn(
							`⚠️ Пропущен документ ${index + 1} для "${shopName}" — отсутствует или некорректный total в DOCUMENT_CLOSE_FPRINT`,
						);
						return null;
					}

					// Сдвиг времени на +3 часа
					const shifted = new Date(originalDate.getTime());
					const value = closeFprint.total;

					// console.log(
					// 	`  ▶️ Документ ${index + 1}: time=${originalDate.toISOString()} (+3h=${shifted.toISOString()}), total=${value}`,
					// );

					return {
						time: shifted.toISOString(),
						value,
					};
				})
				.filter((item): item is ChartPoint => item !== null); // Типобезопасная фильтрация

			chartData.push({
				shopName,
				data,
			});
		}

		// console.log("✅ Данные о продажах успешно собраны");

		return chartData;
	} catch (error) {
		console.error(
			`❌ getSalesData: Ошибка при получении данных о продажах для магазинов ${shopUuids.join(", ")}`,
			error,
		);
		throw error;
	}
}
/**
 * Получает документы типа "SELL"/"PAYBACK" и вычисляет общую сумму продаж и количество товаров.
 *
 * @param db - База данных D1.
 * @param shopId - ID магазина.
 * @param since - Дата начала периода.
 * @param until - Дата окончания периода.
 * @param productUuids - UUID товаров, по которым ведётся подсчёт.
 * @returns Объект с общей суммой продаж и количеством по каждому товару.
 * @throws В случае ошибки при запросе или расчётах.
 */
// export async function getSalesStats(
// 	db: D1Database,
// 	shopId: string,
// 	since: string,
// 	until: string,
// 	productUuids: string[],
// ): Promise<SalesStats> {
// 	try {
// 		const documents = await getDocumentsBySalesPeriod(db, shopId, since, until);

// 		let totalSum = 0;
// 		const quantityByProduct: Record<string, number> = {};
// 		const productUuidSet = new Set(productUuids); // Быстрый доступ

// 		for (const doc of documents) {
// 			for (const trans of doc.transactions) {
// 				if (
// 					trans.type === "REGISTER_POSITION" &&
// 					productUuidSet.has(trans.commodityUuid)
// 				) {
// 					totalSum += trans.sum;

// 					const name = trans.commodityName;
// 					quantityByProduct[name] =
// 						(quantityByProduct[name] ?? 0) + trans.quantity;
// 				}
// 			}
// 		}

// 		return { totalSum, quantityByProduct };
// 	} catch (error) {
// 		console.error(
// 			`Ошибка при получении и расчете продаж для магазина с ID: ${shopId}`,
// 			error,
// 		);
// 		throw error;
// 	}
// }

/**
 * Получает данные по продажам товаров из D1 (index_documents) с группировкой
 * по названию товара. Опционально фильтрует по списку названий товаров.
 */
export async function getSalesByProductFromD1(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
	productNames: string[],
): Promise<Record<string, { quantitySale: number; sum: number }>> {
	try {
		const docs = await getDocumentsBySales(db, shopId, since, until);

		const result: Record<string, { quantitySale: number; sum: number }> = {};
		const nameSet =
			productNames.length > 0
				? new Set(productNames.map((n) => n.trim()))
				: null;

		for (const doc of docs) {
			if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
			const isRefund = doc.type === "PAYBACK";
			const sign = isRefund ? -1 : 1;

			for (const tx of doc.transactions) {
				if (tx.type !== "REGISTER_POSITION") continue;
				if (!tx.sum) continue;
				const name = (tx.commodityName || "—").trim();

				if (nameSet && !nameSet.has(name)) continue;

				if (!result[name]) {
					result[name] = { quantitySale: 0, sum: 0 };
				}
				result[name].quantitySale += (tx.quantity || 0) * sign;
				result[name].sum += tx.sum * sign;
			}
		}

		return result;
	} catch (error) {
		console.error(
			`getSalesByProductFromD1: ошибка для магазина ${shopId}`,
			error,
		);
		throw error;
	}
}

/**
 * Получает топ-N товаров по выручке из D1 (index_documents) за период.
 * Возвращает массив объектов ProductData для фронтенда.
 */
export async function getTopProductsFromD1(
	db: D1Database,
	since: string,
	until: string,
	limit = 10,
): Promise<{
	productName: string;
	revenue: number;
	quantity: number;
	refundRevenue: number;
	refundQuantity: number;
	netRevenue: number;
	netQuantity: number;
	grossProfit: number;
	marginPct: number;
	averagePrice: number;
	refundRate: number;
	dailyNetRevenue7: number[];
}[]> {
	try {
		const docs = await db
			.prepare(`
				SELECT type, close_date, transactions
				FROM index_documents
				WHERE close_date >= ?1 AND close_date <= ?2
				  AND type IN ('SELL', 'PAYBACK')
			`)
			.bind(since, until)
			.all();

		if (!docs || !docs.results || docs.results.length === 0) {
			return [];
		}

		const agg: Record<
			string,
			{
				revenue: number;
				quantity: number;
				refundRevenue: number;
				refundQuantity: number;
				cost: number;       // себестоимость проданного (SELL)
				refundCost: number; // себестоимость возвращённого (PAYBACK)
				dailyNet: Map<string, number>; // "YYYY-MM-DD" → чистая выручка за день
			}
		> = {};

		for (const row of docs.results as { type: string; close_date: string; transactions: string }[]) {
			const isRefund = row.type === "PAYBACK";
			const day = row.close_date.slice(0, 10);
			let transactions: any[];
			try {
				transactions = JSON.parse(row.transactions);
			} catch {
				continue;
			}
			if (!Array.isArray(transactions)) continue;
			for (const tx of transactions) {
				if (tx.type !== "REGISTER_POSITION") continue;
				const name = (tx.commodityName || "—").trim();
				if (!agg[name]) {
					agg[name] = {
						revenue: 0,
						quantity: 0,
						refundRevenue: 0,
						refundQuantity: 0,
						cost: 0,
						refundCost: 0,
						dailyNet: new Map(),
					};
				}
				const sum = tx.sum ?? 0;
				const quantity = tx.quantity ?? 0;
				// costPrice on Evotor's REGISTER_POSITION is cost per unit,
				// not per line — multiply by quantity for the line's total cost.
				const lineCost = (tx.costPrice ?? 0) * quantity;

				if (isRefund) {
					agg[name].refundRevenue += sum;
					agg[name].refundQuantity += quantity;
					agg[name].refundCost += lineCost;
					agg[name].dailyNet.set(day, (agg[name].dailyNet.get(day) ?? 0) - sum);
				} else {
					agg[name].revenue += sum;
					agg[name].quantity += quantity;
					agg[name].cost += lineCost;
					agg[name].dailyNet.set(day, (agg[name].dailyNet.get(day) ?? 0) + sum);
				}
			}
		}

		// Trailing 7 days of the requested window, oldest → newest — same
		// convention as the dashboard revenue sparkline, so a product's
		// trend line and the dashboard's revenue trend line read the same way.
		const untilDate = new Date(until.slice(0, 10) + "T00:00:00+03:00");

		// Обогащение: загруженная себестоимость из 1С — авторитетный источник.
		// Используем цену, актуальную на начало периода (since).
		const allNames = Object.keys(agg);
		if (allNames.length > 0) {
			const uploadedCosts = await getCostPricesForPeriod(db, allNames, since);
			if (uploadedCosts.size > 0) {
				for (const [name, d] of Object.entries(agg)) {
					const uploadedPrice = uploadedCosts.get(name);
					if (uploadedPrice) {
						d.cost = uploadedPrice * d.quantity;
						if (d.refundQuantity > 0) {
							d.refundCost = uploadedPrice * d.refundQuantity;
						}
					}
				}
			}
		}

		const last7Days: string[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(untilDate.getTime() - i * 86_400_000);
			last7Days.push(d.toISOString().slice(0, 10));
		}

		return Object.entries(agg)
			.map(([productName, d]) => {
				const netRevenue = d.revenue - d.refundRevenue;
				const netQuantity = d.quantity - d.refundQuantity;
				const netCost = d.cost - d.refundCost;
				const grossProfit = netRevenue - netCost;
				const grossRevenue = d.revenue + d.refundRevenue;
				return {
					productName,
					revenue: d.revenue,
					quantity: d.quantity,
					refundRevenue: d.refundRevenue,
					refundQuantity: d.refundQuantity,
					netRevenue,
					netQuantity,
					grossProfit: Math.round(grossProfit),
					marginPct: netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0,
					averagePrice: netQuantity > 0 ? netRevenue / netQuantity : 0,
					refundRate: grossRevenue > 0 ? (d.refundRevenue / grossRevenue) * 100 : 0,
					dailyNetRevenue7: last7Days.map(day => Math.round(d.dailyNet.get(day) ?? 0)),
				};
			})
			.sort((a, b) => b.netRevenue - a.netRevenue)
			.slice(0, limit);
	} catch (error) {
		console.error("getTopProductsFromD1: ошибка", error);
		return [];
	}
}

/**
 * Получает имена товаров для заданных групп из D1 (shopProduct).
 */
export async function getProductNamesByGroup(
	db: D1Database,
	shopId: string,
	groupIds: string[],
): Promise<string[]> {
	try {
		if (groupIds.length === 0) return [];

		const placeholders = groupIds.map(() => "?").join(", ");
		const query = `
			SELECT DISTINCT TRIM(name) as name
			FROM shopProduct
			WHERE shopId = ?1 AND parentUuid IN (${placeholders})
		`;

		const result = await db
			.prepare(query)
			.bind(shopId, ...groupIds)
			.all();

		if (!result || !result.results || result.results.length === 0) {
			return [];
		}

		return (result.results as { name: string }[]).map((row) => row.name.trim());
	} catch (err) {
		console.error(
			`getProductNamesByGroup: ошибка для магазина ${shopId}:`,
			err,
		);
		throw err;
	}
}

/**
 * Получает данные по продажам аксессуаров и не-аксессуаров из D1.
 * Классификация: товар считается аксессуаром, если его родительская группа
 * в shopProduct содержит "аксессуар" в названии (case-insensitive).
 */
export async function getAccessoriesSalesFromD1(
	db: D1Database,
	since: string,
	until: string,
	shopNameMap: Record<string, string>,
): Promise<{
	byShop: Array<{ shopId: string; shopName: string; sales: Array<{ name: string; quantity: number; sum: number; cost: number }> }>;
	total: Array<{ name: string; shopName: string; quantity: number; sum: number; cost: number }>;
	nonAccessoriesByShop: Array<{ shopId: string; shopName: string; sales: Array<{ name: string; quantity: number; sum: number; cost: number }> }>;
	nonAccessoriesTotal: Array<{ name: string; shopName: string; quantity: number; sum: number; cost: number }>;
}> {
	const empty = {
		byShop: [] as Array<{ shopId: string; shopName: string; sales: Array<{ name: string; quantity: number; sum: number; cost: number }> }>,
		total: [] as Array<{ name: string; shopName: string; quantity: number; sum: number; cost: number }>,
		nonAccessoriesByShop: [] as Array<{ shopId: string; shopName: string; sales: Array<{ name: string; quantity: number; sum: number; cost: number }> }>,
		nonAccessoriesTotal: [] as Array<{ name: string; shopName: string; quantity: number; sum: number; cost: number }>,
	};

	try {
		// 1. Получаем группы аксессуаров из таблицы accessories (настройки)
		const groupResult = await db.prepare("SELECT uuid FROM accessories").all();
		const groupUuids: string[] = [];
		if (groupResult?.results) {
			for (const row of groupResult.results as { uuid: string }[]) {
				groupUuids.push(row.uuid);
			}
		}

		// 2. Получаем UUID товаров, входящих в эти группы, из shopProduct
		const accessoryUuids = new Set<string>();
		if (groupUuids.length > 0) {
			const placeholders = groupUuids.map(() => "?").join(",");
			const productResult = await db
				.prepare(
					`SELECT DISTINCT uuid FROM shopProduct WHERE parentUuid IN (${placeholders}) AND product_group = 0`
				)
				.bind(...groupUuids)
				.all();

			if (productResult?.results) {
				for (const row of productResult.results as { uuid: string }[]) {
					accessoryUuids.add(row.uuid);
				}
			}
		}

		// 2. Запрашиваем все SELL/PAYBACK документы за период
		const docs = await db
			.prepare(`
				SELECT shop_id, type, transactions
				FROM index_documents
				WHERE close_date >= ?1 AND close_date <= ?2
				  AND type IN ('SELL', 'PAYBACK')
			`)
			.bind(since, until)
			.all();

		if (!docs?.results || docs.results.length === 0) return empty;

		// 3. Агрегируем: byShop для акс/не-акс + total для акс/не-акс
		const accByShop: Record<string, Record<string, { quantity: number; sum: number; cost: number }>> = {};
		const nonAccByShop: Record<string, Record<string, { quantity: number; sum: number; cost: number }>> = {};

		for (const row of docs.results as { shop_id: string; type: string; transactions: string }[]) {
			const shopId = row.shop_id;
			const isRefund = row.type === "PAYBACK";
			const sign = isRefund ? -1 : 1;

			let transactions: any[];
			try {
				transactions = JSON.parse(row.transactions);
			} catch {
				continue;
			}
			if (!Array.isArray(transactions)) continue;

			for (const tx of transactions) {
				if (tx.type !== "REGISTER_POSITION") continue;
				if (!tx.sum && tx.sum !== 0) continue;
				const name = (tx.commodityName || "—").trim();
				const isAccessory = tx.commodityUuid && accessoryUuids.has(tx.commodityUuid);

				const target = isAccessory ? accByShop : nonAccByShop;
				if (!target[shopId]) target[shopId] = {};
				if (!target[shopId][name]) {
					target[shopId][name] = { quantity: 0, sum: 0, cost: 0 };
				}
				target[shopId][name].quantity += (tx.quantity || 0) * sign;
				target[shopId][name].sum += (tx.sum || 0) * sign;
				target[shopId][name].cost += ((tx.costPrice ?? 0) * (tx.quantity || 0)) * sign;
			}
		}

		// 4. Собираем результат
		const byShop: typeof empty.byShop = [];
		const total: typeof empty.total = [];
		const nonAccessoriesByShop: typeof empty.nonAccessoriesByShop = [];
		const nonAccessoriesTotal: typeof empty.nonAccessoriesTotal = [];

		for (const [shopId, products] of Object.entries(accByShop)) {
			const shopName = shopNameMap[shopId] || shopId;
			const sales = Object.entries(products).map(([name, d]) => ({
				name,
				quantity: d.quantity,
				sum: d.sum,
				cost: d.cost,
			}));
			byShop.push({ shopId, shopName, sales });
			for (const s of sales) {
				total.push({ name: s.name, shopName, quantity: s.quantity, sum: s.sum, cost: s.cost });
			}
		}

		for (const [shopId, products] of Object.entries(nonAccByShop)) {
			const shopName = shopNameMap[shopId] || shopId;
			const sales = Object.entries(products).map(([name, d]) => ({
				name,
				quantity: d.quantity,
				sum: d.sum,
				cost: d.cost,
			}));
			nonAccessoriesByShop.push({ shopId, shopName, sales });
			for (const s of sales) {
				nonAccessoriesTotal.push({ name: s.name, shopName, quantity: s.quantity, sum: s.sum, cost: s.cost });
			}
		}

		return { byShop, total, nonAccessoriesByShop, nonAccessoriesTotal };
	} catch (error) {
		console.error("getAccessoriesSalesFromD1: ошибка", error);
		return empty;
	}
}

/**
 * Обогащает себестоимость в результатах getAccessoriesSalesFromD1
 * загруженными ценами из 1С (приоритет над Evotor costPrice).
 */
export async function enrichAccessoriesCost(
	db: D1Database,
	since: string,
	result: Awaited<ReturnType<typeof getAccessoriesSalesFromD1>>,
): Promise<void> {
	const allNames = new Set<string>();
	for (const item of result.total) allNames.add(item.name);
	for (const item of result.nonAccessoriesTotal) allNames.add(item.name);
	if (allNames.size === 0) return;

	const uploadedCosts = await getCostPricesForPeriod(db, [...allNames], since);
	if (uploadedCosts.size === 0) return;

	const apply = (list: Array<{ name: string; quantity: number; sum: number; cost: number }>) => {
		for (const item of list) {
			const price = uploadedCosts.get(item.name);
			if (price) item.cost = price * item.quantity;
		}
	};

	apply(result.total);
	apply(result.nonAccessoriesTotal);
	for (const shop of result.byShop) apply(shop.sales);
	for (const shop of result.nonAccessoriesByShop) apply(shop.sales);
}

// ============================================================================
// Sales by product group (vape / accessory / other)
// ============================================================================

/**
 * Возвращает сумму продаж (net: SELL − PAYBACK) по товарным группам.
 *
 * Группы:
 * - vape:       товары, чей parentUuid ∈ VAPE_GROUP_UUIDS
 * - accessory:  товары, чей parentUuid ∈ таблица accessories (не вейпы)
 * - other:      всё остальное
 */
export async function getSalesByProductGroup(
	db: D1Database,
	since: string,
	until: string,
): Promise<{ vape: number; accessory: number; other: number }> {
	const result = { vape: 0, accessory: 0, other: 0 };

	try {
		// 1. Собираем UUID вейп-товаров
		const vapePlaceholders = VAPE_GROUP_UUIDS.map(() => "?").join(",");
		const vapeRows = await db
			.prepare(
				`SELECT uuid FROM shopProduct WHERE parentUuid IN (${vapePlaceholders})`,
			)
			.bind(...VAPE_GROUP_UUIDS)
			.all<{ uuid: string }>();
		const vapeUuids = new Set((vapeRows.results ?? []).map(r => r.uuid));

		// 2. Собираем UUID аксессуарных товаров (не вейпы)
		const accessoryUuids = new Set<string>();
		try {
			const accParents = await db
				.prepare("SELECT uuid FROM accessories")
				.all<{ uuid: string }>();
			const parentUuids = (accParents.results ?? []).map(r => r.uuid);
			if (parentUuids.length > 0) {
				const accPlaceholders = parentUuids.map(() => "?").join(",");
				const accRows = await db
					.prepare(
						`SELECT uuid FROM shopProduct WHERE parentUuid IN (${accPlaceholders})`,
					)
					.bind(...parentUuids)
					.all<{ uuid: string }>();
				for (const r of accRows.results ?? []) {
					if (!vapeUuids.has(r.uuid)) accessoryUuids.add(r.uuid);
				}
			}
		} catch {
			// accessories table may not exist
		}

		// 3. Запрашиваем все SELL/PAYBACK
		const docs = await db
			.prepare(`
				SELECT type, transactions
				FROM index_documents
				WHERE close_date >= ?1 AND close_date <= ?2
				  AND type IN ('SELL', 'PAYBACK')
			`)
			.bind(since, until)
			.all();

		if (!docs?.results || docs.results.length === 0) return result;

		for (const row of docs.results as { type: string; transactions: string }[]) {
			const isRefund = row.type === "PAYBACK";
			const sign = isRefund ? -1 : 1;

			let transactions: any[];
			try {
				transactions = JSON.parse(row.transactions);
			} catch {
				continue;
			}
			if (!Array.isArray(transactions)) continue;

			for (const tx of transactions) {
				if (tx.type !== "REGISTER_POSITION") continue;
				const sum = tx.sum ?? 0;
				const uuid = tx.commodityUuid as string | undefined;

				if (uuid && vapeUuids.has(uuid)) {
					result.vape += sum * sign;
				} else if (uuid && accessoryUuids.has(uuid)) {
					result.accessory += sum * sign;
				} else {
					result.other += sum * sign;
				}
			}
		}

		// Не допускаем отрицательных значений
		result.vape = Math.max(0, Math.round(result.vape));
		result.accessory = Math.max(0, Math.round(result.accessory));
		result.other = Math.max(0, Math.round(result.other));
	} catch (error) {
		console.error("getSalesByProductGroup: ошибка", error);
	}

	return result;
}

// ============================================================================
// D1-only helpers — no Evotor API calls
// ============================================================================

/**
 * Получает OPEN_SESSION документы из index_documents за период.
 */
export async function getOpenSessionsFromD1(
	db: D1Database,
	since: string,
	until: string,
): Promise<Array<{ storeUuid: string; openUserUuid: string; openTime: string }>> {
	const result = await db
		.prepare(
			`SELECT shop_id, open_user_uuid, close_date FROM index_documents
			 WHERE close_date >= ? AND close_date <= ? AND type = 'OPEN_SESSION'`
		)
		.bind(since, until)
		.all<{ shop_id: string; open_user_uuid: string; close_date: string }>();

	return (result.results ?? []).map((r) => ({
		storeUuid: r.shop_id,
		openUserUuid: r.open_user_uuid,
		openTime: r.close_date,
	}));
}

/**
 * Получает UUID товаров, входящих в заданные группы, из shopProduct.
 */
export async function getProductsByGroupFromD1(
	db: D1Database,
	groupUuids: string[],
): Promise<string[]> {
	if (groupUuids.length === 0) return [];
	const placeholders = groupUuids.map(() => "?").join(",");
	const result = await db
		.prepare(
			`SELECT DISTINCT uuid FROM shopProduct WHERE parentUuid IN (${placeholders}) AND product_group = 0`
		)
		.bind(...groupUuids)
		.all<{ uuid: string }>();

	return (result.results ?? []).map((r) => r.uuid);
}

/**
 * Вычисляет сумму продаж для заданных товаров из index_documents.
 */
export async function getSalesSumFromD1(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
	productUuids: string[],
): Promise<number> {
	if (productUuids.length === 0) return 0;
	const productSet = new Set(productUuids);

	const result = await db
		.prepare(
			`SELECT transactions FROM index_documents
			 WHERE shop_id = ? AND close_date >= ? AND close_date <= ?
			   AND type IN ('SELL', 'PAYBACK')`
		)
		.bind(shopId, since, until)
		.all<{ transactions: string }>();

	let total = 0;
	for (const row of result.results ?? []) {
		try {
			const txs = JSON.parse(row.transactions);
			if (!Array.isArray(txs)) continue;
			for (const tx of txs) {
				if (
					tx.type === "REGISTER_POSITION" &&
					tx.commodityUuid &&
					productSet.has(tx.commodityUuid)
				) {
					total += tx.sum ?? 0;
				}
			}
		} catch { /* skip malformed JSON */ }
	}
	return total;
}

/**
 * Извлекает продажи из index_documents — D1-версия extractSalesInfo.
 */
export async function extractSalesInfoFromD1(
	db: D1Database,
	since: string,
	until: string,
): Promise<Array<{
	type: string;
	shopName: string;
	closeDate: string;
	employeeName: string;
	paymentData: Array<{ paymentType: string; sum: number }>;
	transactions: Array<{ productName: string; quantity: number; price: number; costPrice: number; sum: number }>;
}>> {
	const { getShopNameUuidsDictFromDB, getEmployeesDictFromDB } = await import("../sync/db.js");
	const [shops, employees] = await Promise.all([
		getShopNameUuidsDictFromDB(db),
		getEmployeesDictFromDB(db),
	]);

	const result = await db
		.prepare(
			`SELECT close_date, number, open_user_uuid, shop_id, type, transactions
			 FROM index_documents
			 WHERE close_date >= ? AND close_date <= ?
			   AND type IN ('SELL', 'PAYBACK')
			 ORDER BY close_date DESC
			 LIMIT 500`
		)
		.bind(since, until)
		.all<{ close_date: string; open_user_uuid: string; shop_id: string; type: string; transactions: string }>();

	return (result.results ?? []).map((row) => {
		const txs = (() => { try { return JSON.parse(row.transactions) ?? []; } catch { return []; } })();
		return {
			type: row.type === "SELL" ? "SALE" : "PAYBACK",
			shopName: shops[row.shop_id] ?? row.shop_id,
			closeDate: row.close_date,
			employeeName: employees[row.open_user_uuid] ?? row.open_user_uuid,
			paymentData: txs
				.filter((tx: any) => tx.type === "PAYMENT")
				.map((payment: any) => ({
					paymentType: payment.paymentType || "",
					sum: payment.sum || 0,
				})),
			transactions: txs
				.filter((tx: any) => tx.type === "REGISTER_POSITION")
				.map((pos: any) => ({
					productName: pos.commodityName,
					quantity: pos.quantity,
					price: pos.price,
					costPrice: pos.costPrice,
					sum: pos.sum,
				})),
		};
	});
}

/**
 * Рассчитывает остаток наличных по магазинам из index_documents.
 */
export async function getCashByShopsFromD1(
	db: D1Database,
): Promise<Record<string, number>> {
	const { getShopNameUuidsFromDB, getShopUuidsFromDB } = await import("../sync/db.js");
	const shopUuids = await getShopUuidsFromDB(db);

	const reportData: Record<string, number> = {};

	for (const shopId of shopUuids) {
		try {
			// 1. Найти последний FPRINT_Z_REPORT
			const fprint = await db
				.prepare(
					`SELECT transactions FROM index_documents
					 WHERE shop_id = ? AND type = 'FPRINT'
					 ORDER BY close_date DESC LIMIT 1`
				)
				.bind(shopId)
				.first<{ transactions: string }>();

			let totalCash = 0;
			let sinceDate = "";

			if (fprint) {
				const txs = (() => { try { return JSON.parse(fprint.transactions) ?? []; } catch { return []; } })();
				for (const tx of txs) {
					if (tx.type === "FPRINT_Z_REPORT" && tx.cash != null) {
						totalCash += tx.cash;
					}
				}
			}

			// 2. Получаем все операции после последнего FPRINT (или все, если нет FPRINT)
			const cashRows = await db
				.prepare(
					`SELECT type, transactions FROM index_documents
					 WHERE shop_id = ? AND type IN ('SELL', 'PAYBACK', 'CASH_INCOME', 'CASH_OUTCOME')${sinceDate ? " AND close_date > ?" : ""}
					 ORDER BY close_date ASC`
				)
				.bind(sinceDate ? shopId : shopId, ...(sinceDate ? [sinceDate] : []))
				.all<{ type: string; transactions: string }>();

			for (const row of cashRows.results ?? []) {
				const txs = (() => { try { return JSON.parse(row.transactions) ?? []; } catch { return []; } })();
				for (const tx of txs) {
					if (tx.type === "PAYMENT" && tx.paymentType === "CASH" && ["SELL", "PAYBACK"].includes(row.type)) {
						totalCash += row.type === "SELL" ? (tx.sum || 0) : -(tx.sum || 0);
					} else if (tx.type === row.type && ["CASH_INCOME", "CASH_OUTCOME"].includes(row.type)) {
						totalCash += row.type === "CASH_INCOME" ? (tx.sum || 0) : -(tx.sum || 0);
					}
				}
			}

			reportData[shopId] = totalCash;
		} catch (e) {
			console.error(`[getCashByShopsFromD1] Ошибка для ${shopId}:`, e);
			reportData[shopId] = 0;
		}
	}

	// Переводим ключи с shopId → shopName
	const shopNames = await getShopNameUuidsFromDB(db);
	const named: Record<string, number> = {};
	for (const [shopId, cash] of Object.entries(reportData)) {
		const name = shopNames.find(s => s.uuid === shopId)?.name ?? shopId;
		named[name] = cash;
	}
	return named;
}

/**
 * Получает данные о продажах за сегодня из index_documents.
 */
export async function getSalesTodayFromD1(
	db: D1Database,
): Promise<Record<string, Record<string, number>>> {
	const { getShopNameUuidsFromDB, getShopUuidsFromDB } = await import("../sync/db.js");

	const now = new Date();
	const since = formatDateWithTimeLocal(now, false);
	const until = formatDateWithTimeLocal(now, true);

	const paymentType: Record<string, string> = {
		CARD: "Банковской картой:",
		ADVANCE: "Предоплатой (зачетом аванса):",
		CASH: "Нал. средствами:",
		COUNTEROFFER: "Встречным предоставлением:",
		CREDIT: "Постоплатой (в кредит):",
		ELECTRON: "Безналичными средствами:",
		UNKNOWN: "Неизвестно. По-умолчанию:",
	};

	const shopUuids = await getShopUuidsFromDB(db);
	const shopNames = await getShopNameUuidsFromDB(db);
	const nameMap = new Map(shopNames.map(s => [s.uuid, s.name]));

	const salesByShop: Record<string, Record<string, number>> = {};

	for (const shopUuid of shopUuids) {
		const result = await db
			.prepare(
				`SELECT transactions FROM index_documents
				 WHERE shop_id = ? AND close_date >= ? AND close_date <= ?
				   AND type IN ('SELL', 'PAYBACK')`
			)
			.bind(shopUuid, since, until)
			.all<{ transactions: string }>();

		const shopName = nameMap.get(shopUuid) ?? shopUuid;
		if (!salesByShop[shopName]) salesByShop[shopName] = {};

		for (const row of result.results ?? []) {
			try {
				const txs = JSON.parse(row.transactions);
				if (!Array.isArray(txs)) continue;
				for (const tx of txs) {
					if (tx.type === "PAYMENT") {
						const label = paymentType[tx.paymentType] || paymentType.UNKNOWN;
						salesByShop[shopName][label] = (salesByShop[shopName][label] || 0) + (tx.sum || 0);
					}
				}
			} catch { /* skip */ }
		}
	}

	// Sort by total descending
	const sorted: Record<string, Record<string, number>> = {};
	Object.entries(salesByShop)
		.sort(([, a], [, b]) => {
			const sumA = Object.values(a).reduce((s, v) => s + v, 0);
			const sumB = Object.values(b).reduce((s, v) => s + v, 0);
			return sumB - sumA;
		})
		.forEach(([k, v]) => { sorted[k] = v; });

	return sorted;
}

function formatDateWithTimeLocal(date: Date, isEndOfDay: boolean): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const time = isEndOfDay ? "23:59:59" : "00:00:00";
	return `${y}-${m}-${d}T${time}.000+0300`;
}

// ============================================================================
// Новые D1-методы для dead-stock (добавлены 2026-07-16)
// Все методы — только SELECT, не меняют данные.
// ============================================================================

/**
 * Возвращает дату последней продажи по каждому имени товара (за всё время).
 * Один SQL-запрос с агрегацией, без ручного парсинга JSON.
 *
 * @param db D1
 * @param shopId UUID магазина
 * @param productNames массив имён товаров для фильтрации (для скорости)
 * @returns Map<имя товара, дата последней продажи YYYY-MM-DD>
 */
export async function getAllTimeLastSale(
	db: D1Database,
	shopId: string,
	productNames: string[],
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	if (productNames.length === 0) return result;

	const namePlaceholders = productNames.map(() => "?").join(",");
	const docs = await db.prepare(
		`SELECT close_date, transactions FROM index_documents
		 WHERE shop_id = ? AND type IN ('SELL', 'PAYBACK')`
	).bind(shopId).all<{ close_date: string; transactions: string }>();

	for (const doc of (docs.results ?? [])) {
		const day = doc.close_date.slice(0, 10);
		let txs: any[];
		try { txs = JSON.parse(doc.transactions); } catch { continue; }
		if (!Array.isArray(txs)) continue;

		for (const tx of txs) {
			if (tx.type !== "REGISTER_POSITION") continue;
			const name = (tx.commodityName || "").trim();
			if (!name) continue;
			if (!result.has(name) || day > result.get(name)!) {
				result.set(name, day);
			}
		}
	}
	return result;
}

/**
 * Продажи конкретного товара по ВСЕМ магазинам за период.
 * Возвращает массив {shopName, qty} для каждого магазина (включая нули).
 *
 * @param db D1
 * @param productName точное имя товара (как в shopProduct и transactions)
 * @param since дата начала YYYY-MM-DD
 * @returns [{shopName, qty}, ...] — один объект на магазин
 */
export async function getPerShopSales(
	db: D1Database,
	productName: string,
	since: string,
): Promise<{ shopName: string; qty: number }[]> {
	const shops = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
	const shopList = shops.results ?? [];
	const results: { shopName: string; qty: number }[] = [];

	if (shopList.length === 0) return results;

	// Один запрос: в каких магазинах есть этот товар
	const shopUuids = shopList.map(s => s.uuid);
	const placeholders = shopUuids.map(() => "?").join(",");
	const productRows = await db.prepare(
		`SELECT shopId FROM shopProduct WHERE name = ? AND shopId IN (${placeholders})`
	).bind(productName, ...shopUuids).all<{ shopId: string }>();
	const shopsWithProduct = new Set((productRows.results ?? []).map(r => r.shopId));

	// Для каждого магазина с товаром — считаем продажи
	for (const shop of shopList) {
		let qty = 0;
		if (shopsWithProduct.has(shop.uuid)) {
			const docs = await db.prepare(
				`SELECT transactions FROM index_documents
				 WHERE shop_id = ? AND close_date >= ? AND type IN ('SELL', 'PAYBACK')`
			).bind(shop.uuid, since + "T00:00:00").all<{ transactions: string }>();

			for (const doc of (docs.results ?? [])) {
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;
				for (const tx of txs) {
					if (tx.type !== "REGISTER_POSITION") continue;
					if ((tx.commodityName || "").trim() !== productName) continue;
					qty += tx.quantity ?? 0;
				}
			}
		}
		results.push({ shopName: shop.name, qty });
	}

	results.sort((a, b) => b.qty - a.qty);
	return results;
}

/**
 * Мета-информация о товаре: артикул.
 * Быстрый lookup по имени + shopId.
 *
 * @param db D1
 * @param shopId UUID магазина
 * @param productName точное имя товара
 * @returns {article} или null если товар не найден
 */
export async function getProductMeta(
	db: D1Database,
	shopId: string,
	productName: string,
): Promise<{ article: string } | null> {
	const row = await db.prepare(
		"SELECT article FROM shopProduct WHERE shopId = ? AND name = ? LIMIT 1"
	).bind(shopId, productName).first<{ article: string | null }>();

	if (!row) return null;
	return { article: row.article || "" };
}

/**
 * Остатки товаров из D1 (shopProduct.quantity).
 * Данные попадают в shopProduct через syncStock (Evotor API v2 stock → D1).
 *
 * Используется ТОЛЬКО в dead-stock (на тестировании).
 * После подтверждения — заменит прямые вызовы Evotor API в других отчётах.
 *
 * @param db D1
 * @param shopId UUID магазина
 * @param productNames список имён товаров (если пустой — вернёт все остатки магазина)
 * @returns Map<имя товара, quantity>
 */
export async function getProductStockFromD1(
	db: D1Database,
	shopId: string,
	productNames: string[],
): Promise<Map<string, number>> {
	const result = new Map<string, number>();

	try {
		if (productNames.length === 0) {
			// Все товары магазина с ненулевым остатком
			const rows = await db.prepare(
				"SELECT name, quantity FROM shopProduct WHERE shopId = ? AND quantity > 0"
			).bind(shopId).all<{ name: string; quantity: number }>();

			for (const row of (rows.results ?? [])) {
				result.set(row.name, row.quantity);
			}
		} else {
			// Конкретные товары по именам
			const placeholders = productNames.map(() => "?").join(",");
			const rows = await db.prepare(
				`SELECT name, quantity FROM shopProduct WHERE shopId = ? AND name IN (${placeholders})`
			).bind(shopId, ...productNames).all<{ name: string; quantity: number }>();

			for (const row of (rows.results ?? [])) {
				result.set(row.name, row.quantity ?? 0);
			}

			// Товары, не найденные в shopProduct — остаток 0
			for (const name of productNames) {
				if (!result.has(name)) result.set(name, 0);
			}
		}
	} catch (e: any) {
		// Колонка quantity может отсутствовать до первой миграции — не фатально.
		// Возвращаем placeholder = 1 («в наличии, точное количество неизвестно»),
		// чтобы фильтр qty <= 0 не отсекал все товары.
		console.warn("[getProductStockFromD1] ошибка (возможно нет колонки quantity):", e?.message);
		for (const name of productNames) {
			result.set(name, 1);
		}
	}

	return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Себестоимость — загрузка и получение
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Загружает себестоимости с историей (SCD Type 2).
 *
 * Для каждого товара:
 * 1. Находит текущую активную запись (effectiveTo IS NULL)
 * 2. Если цена не изменилась — пропускает
 * 3. Закрывает старую запись (effectiveTo = effectiveFrom - 1 сек)
 * 4. Создаёт новую запись с переданной effectiveFrom
 *
 * @param effectiveFrom — дата начала действия (строка ISO, по умолчанию now)
 * @returns { inserted, updated, skipped }
 */
export async function upsertCostPricesWithHistory(
	db: D1Database,
	rows: { productName: string; costPrice: number }[],
	effectiveFrom?: string,
): Promise<{ inserted: number; updated: number; skipped: number }> {
	if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

	const effFrom = effectiveFrom || new Date().toISOString().slice(0, 19).replace("T", " ");
	let inserted = 0, updated = 0, skipped = 0;

	// Дедупликация внутри батча: последнее значение для каждого товара
	const unique = new Map<string, number>();
	for (const row of rows) {
		unique.set(row.productName, row.costPrice);
	}

	for (const [productName, costPrice] of unique) {
		// Текущая активная запись
		const current = await db
			.prepare("SELECT id, costPrice, effectiveFrom FROM product_cost_prices WHERE productName = ? AND effectiveTo IS NULL")
			.bind(productName)
			.first<{ id: number; costPrice: number; effectiveFrom: string }>();

		// Цена не изменилась — пропускаем
		if (current && Math.abs(current.costPrice - costPrice) < 0.01) {
			skipped++;
			continue;
		}

		// Закрываем старую запись
		if (current) {
			const effTo = new Date(new Date(effFrom + "Z").getTime() - 1000).toISOString().slice(0, 19).replace("T", " ");
			await db
				.prepare("UPDATE product_cost_prices SET effectiveTo = ? WHERE id = ?")
				.bind(effTo, current.id)
				.run();
			updated++;
		}

		// Новая запись
		await db
			.prepare(`INSERT INTO product_cost_prices (productName, costPrice, effectiveFrom)
			           VALUES (?, ?, ?)`)
			.bind(productName, costPrice, effFrom)
			.run();
		inserted++;
	}

	return { inserted, updated, skipped };
}

/**
 * Получает себестоимость товара на конкретную дату.
 * Возвращает цену, действовавшую на date (последняя effectiveFrom <= date).
 */
export async function getCostPriceForDate(
	db: D1Database,
	productName: string,
	date: string,
): Promise<number | null> {
	const dateNorm = date.length <= 10 ? date + " 00:00:00" : date;
	const row = await db
		.prepare(`
			SELECT costPrice FROM product_cost_prices
			WHERE productName = ? AND effectiveFrom <= ?
			  AND (effectiveTo IS NULL OR effectiveTo > ?)
			ORDER BY effectiveFrom DESC
			LIMIT 1
		`)
		.bind(productName, dateNorm, dateNorm)
		.first<{ costPrice: number }>();

	return row?.costPrice ?? null;
}

/**
 * Получает себестоимости для списка товаров, актуальные на дату since.
 * Используется для расчёта маржи за период: цена, действовавшая на начало периода.
 *
 * @returns Map<productName, costPrice>
 */
export async function getCostPricesForPeriod(
	db: D1Database,
	productNames: string[],
	since: string,
): Promise<Map<string, number>> {
	const result = new Map<string, number>();
	if (productNames.length === 0) return result;

	// Нормализуем since: добавляем время, если его нет (стринговое сравнение)
	const sinceNorm = since.length <= 10 ? since + " 00:00:00" : since;

	const placeholders = productNames.map(() => "?").join(", ");
	const rows = await db
		.prepare(`
			SELECT productName, costPrice FROM product_cost_prices
			WHERE productName IN (${placeholders})
			  AND effectiveFrom <= ?2
			  AND (effectiveTo IS NULL OR effectiveTo > ?2)
			ORDER BY productName, effectiveFrom DESC
		`)
		.bind(...productNames, sinceNorm)
		.all<{ productName: string; costPrice: number }>();

	// D1 может вернуть несколько записей на один товар — берём первую (самую свежую)
	if (rows.results) {
		for (const row of rows.results) {
			if (!result.has(row.productName)) {
				result.set(row.productName, row.costPrice);
			}
		}
	}

	return result;
}

/**
 * Строит карту UUID товара → загруженная из 1С себестоимость, актуальная на
 * дату `since`. Совмещает shopProduct (uuid → name) с product_cost_prices
 * (name → costPrice, период-зависимо). Используется там, где расчёт идёт по
 * commodityUuid из транзакций Эвотора (а не по имени напрямую), например —
 * в агрегации метрик продавцов (маржа).
 *
 * Если для товара нет загруженной из 1С цены, он просто отсутствует в
 * возвращённой карте — вызывающий код должен сам предусмотреть fallback
 * (обычно — на costPrice из самого документа Эвотора).
 */
export async function getCostPriceMapByUuid(
	db: D1Database,
	since: string,
): Promise<Map<string, number>> {
	const result = new Map<string, number>();

	// 1. uuid → name (может быть несколько записей на uuid из-за разных shopId —
	//    берём любое непустое имя, для целей матчинга себестоимости этого достаточно)
	const nameRows = await db
		.prepare(`SELECT DISTINCT uuid, name FROM shopProduct WHERE name IS NOT NULL AND name != ''`)
		.all<{ uuid: string; name: string }>();

	const uuidToName = new Map<string, string>();
	for (const r of nameRows.results ?? []) {
		if (!uuidToName.has(r.uuid)) uuidToName.set(r.uuid, r.name);
	}

	if (uuidToName.size === 0) return result;

	// 2. name → costPrice (период-зависимо, переиспользуем существующую функцию)
	const allNames = [...new Set(uuidToName.values())];
	const priceByName = await getCostPricesForPeriod(db, allNames, since);

	if (priceByName.size === 0) return result;

	// 3. uuid → costPrice, через join по имени
	for (const [uuid, name] of uuidToName) {
		const price = priceByName.get(name);
		if (price !== undefined) result.set(uuid, price);
	}

	return result;
}

// ════════════════════════════════════════════════════════════════
// Старые методы (оставлены для обратной совместимости)
// ════════════════════════════════════════════════════════════════

/** @deprecated Используйте upsertCostPricesWithHistory */
export async function upsertCostPrices(
	db: D1Database,
	rows: { productName: string; costPrice: number }[],
): Promise<number> {
	const result = await upsertCostPricesWithHistory(db, rows);
	return result.inserted;
}

/** @deprecated Используйте getCostPricesForPeriod */
export async function getCostPricesByNames(
	db: D1Database,
	productNames: string[],
): Promise<Map<string, number>> {
	// Возвращаем текущие цены (эффективные на сейчас)
	const result = new Map<string, number>();
	if (productNames.length === 0) return result;

	const placeholders = productNames.map(() => "?").join(", ");
	const rows = await db
		.prepare(`SELECT productName, costPrice FROM product_cost_prices WHERE productName IN (${placeholders}) AND effectiveTo IS NULL`)
		.bind(...productNames)
		.all<{ productName: string; costPrice: number }>();

	if (rows.results) {
		for (const row of rows.results) {
			result.set(row.productName, row.costPrice);
		}
	}

	return result;
}

/**
 * Получает всю таблицу себестоимостей (для админки).
 */
export async function getAllCostPrices(
	db: D1Database,
): Promise<{ productName: string; costPrice: number; updatedAt: string; effectiveFrom: string; effectiveTo: string | null }[]> {
	const rows = await db
		.prepare("SELECT productName, costPrice, updatedAt, effectiveFrom, effectiveTo FROM product_cost_prices ORDER BY productName ASC, effectiveFrom DESC")
		.all<{ productName: string; costPrice: number; updatedAt: string; effectiveFrom: string; effectiveTo: string | null }>();

	return rows.results ?? [];
}

/**
 * Удаляет себестоимость по имени товара.
 */
export async function deleteCostPrice(
	db: D1Database,
	productName: string,
): Promise<boolean> {
	const result = await db
		.prepare("DELETE FROM product_cost_prices WHERE productName = ?")
		.bind(productName)
		.run();

	return result.meta?.changes > 0;
}

/**
 * Создаёт таблицу product_cost_prices, если её ещё нет.
 * Вызывается при старте локального сервера (server.ts).
 * В production (Cloudflare Workers) таблица создаётся через миграции D1.
 */
export async function createCostPricesTableIfNotExists(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS product_cost_prices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			productName TEXT NOT NULL,
			costPrice REAL NOT NULL DEFAULT 0,
			source TEXT NOT NULL DEFAULT 'upload',
			uploadedAt TEXT NOT NULL DEFAULT (datetime('now')),
			updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
			effectiveFrom TEXT NOT NULL DEFAULT (datetime('now')),
			effectiveTo TEXT
		)
	`).run();

	// Колонки v2 для существующих БД
	try { await db.prepare(`ALTER TABLE product_cost_prices ADD COLUMN effectiveFrom TEXT NOT NULL DEFAULT (datetime('now'))`).run(); } catch {}
	try { await db.prepare(`ALTER TABLE product_cost_prices ADD COLUMN effectiveTo TEXT`).run(); } catch {}
	// Бэкофил для старых записей
	await db.prepare(`UPDATE product_cost_prices SET effectiveFrom = uploadedAt WHERE effectiveFrom IS NULL OR effectiveFrom = ''`).run();

	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_pcp_name ON product_cost_prices (productName)
	`).run();
	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_pcp_name_eff ON product_cost_prices (productName, effectiveFrom DESC)
	`).run();

	console.log("[migration] product_cost_prices v2 (SCD Type 2) — таблица готова");
}

/**
 * Нормализует название товара: trim + замена латинской C на кириллическую С.
 * Используется для сравнения имён из 1С и Evotor.
 */
export function normalizeProductName(name: string): string {
	return name.trim().replace(/\u0043/g, "\u0421");
}


