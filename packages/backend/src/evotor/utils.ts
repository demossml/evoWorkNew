import {
	getDocumentsByCashOutcomeByPeriod,
	getDocumentsBySales,
	getDocumentsBySalesPeriod,
} from "../utils";

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
				SELECT type, transactions
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
			}
		> = {};

		for (const row of docs.results as { type: string; transactions: string }[]) {
			const isRefund = row.type === "PAYBACK";
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
					};
				}
				if (isRefund) {
					agg[name].refundRevenue += tx.sum ?? 0;
					agg[name].refundQuantity += tx.quantity ?? 0;
				} else {
					agg[name].revenue += tx.sum ?? 0;
					agg[name].quantity += tx.quantity ?? 0;
				}
			}
		}

		return Object.entries(agg)
			.map(([productName, d]) => {
				const netRevenue = d.revenue - d.refundRevenue;
				const netQuantity = d.quantity - d.refundQuantity;
				const grossRevenue = d.revenue + d.refundRevenue;
				return {
					productName,
					revenue: d.revenue,
					quantity: d.quantity,
					refundRevenue: d.refundRevenue,
					refundQuantity: d.refundQuantity,
					netRevenue,
					netQuantity,
					grossProfit: 0,
					marginPct: 0,
					averagePrice: netQuantity > 0 ? netRevenue / netQuantity : 0,
					refundRate: grossRevenue > 0 ? (d.refundRevenue / grossRevenue) * 100 : 0,
					dailyNetRevenue7: [0, 0, 0, 0, 0, 0, 0],
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
	byShop: Array<{ shopId: string; shopName: string; sales: Array<{ name: string; quantity: number; sum: number }> }>;
	total: Array<{ name: string; shopName: string; quantity: number; sum: number }>;
	nonAccessoriesByShop: Array<{ shopId: string; shopName: string; sales: Array<{ name: string; quantity: number; sum: number }> }>;
	nonAccessoriesTotal: Array<{ name: string; shopName: string; quantity: number; sum: number }>;
}> {
	const empty = {
		byShop: [] as Array<{ shopId: string; shopName: string; sales: Array<{ name: string; quantity: number; sum: number }> }>,
		total: [] as Array<{ name: string; shopName: string; quantity: number; sum: number }>,
		nonAccessoriesByShop: [] as Array<{ shopId: string; shopName: string; sales: Array<{ name: string; quantity: number; sum: number }> }>,
		nonAccessoriesTotal: [] as Array<{ name: string; shopName: string; quantity: number; sum: number }>,
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
		const accByShop: Record<string, Record<string, { quantity: number; sum: number }>> = {};
		const nonAccByShop: Record<string, Record<string, { quantity: number; sum: number }>> = {};

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
					target[shopId][name] = { quantity: 0, sum: 0 };
				}
				target[shopId][name].quantity += (tx.quantity || 0) * sign;
				target[shopId][name].sum += (tx.sum || 0) * sign;
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
			}));
			byShop.push({ shopId, shopName, sales });
			for (const s of sales) {
				total.push({ name: s.name, shopName, quantity: s.quantity, sum: s.sum });
			}
		}

		for (const [shopId, products] of Object.entries(nonAccByShop)) {
			const shopName = shopNameMap[shopId] || shopId;
			const sales = Object.entries(products).map(([name, d]) => ({
				name,
				quantity: d.quantity,
				sum: d.sum,
			}));
			nonAccessoriesByShop.push({ shopId, shopName, sales });
			for (const s of sales) {
				nonAccessoriesTotal.push({ name: s.name, shopName, quantity: s.quantity, sum: s.sum });
			}
		}

		return { byShop, total, nonAccessoriesByShop, nonAccessoriesTotal };
	} catch (error) {
		console.error("getAccessoriesSalesFromD1: ошибка", error);
		return empty;
	}
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
): Promise<Array<{ storeUuid: string; openUserUuid: string }>> {
	const result = await db
		.prepare(
			`SELECT shop_id, open_user_uuid FROM index_documents
			 WHERE close_date >= ? AND close_date <= ? AND type = 'OPEN_SESSION'`
		)
		.bind(since, until)
		.all<{ shop_id: string; open_user_uuid: string }>();

	return (result.results ?? []).map((r) => ({
		storeUuid: r.shop_id,
		openUserUuid: r.open_user_uuid,
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
