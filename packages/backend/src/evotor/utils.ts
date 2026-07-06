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
	evo: any,
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
				const [shopName, cashOutcomeDocuments] = await Promise.all([
					evo.getShopName(shopUuid),
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
	evo: any,
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
		const [documentsByShop, shopNames] = await Promise.all([
			Promise.all(
				shopUuids.map(async (uuid) => ({
					uuid,
					docs: await getDocumentsBySalesPeriod(db, uuid, since, until),
				})),
			),
			Promise.all(shopUuids.map((uuid) => evo.getShopName(uuid))),
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

		for (const { uuid, docs } of documentsByShop) {
			const sellMap = new Map<string, number>();
			const refundMap = new Map<string, number>();
			let totalSell = 0;
			let totalRefund = 0;

			for (const { type: docType, transactions } of docs) {
				const isRefund = docType === "PAYBACK";
				const targetMap = isRefund ? refundMap : sellMap;

				for (const { type, paymentType, sum } of transactions) {
					if (type !== "PAYMENT" || !paymentType) continue;
					const label =
						paymentTypeLabels[paymentType] || paymentTypeLabels.UNKNOWN;
					targetMap.set(label, (targetMap.get(label) ?? 0) + sum);
					if (isRefund) {
						totalRefund += sum;
					} else {
						totalSell += sum;
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

		return { salesDataByShopName, grandTotalSell, grandTotalRefund };
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
	evo: any,
	shopUuids: string[],
	since: string,
	until: string,
): Promise<ShopChartData[]> {
	try {
		// console.log("⏳ Запрос данных о продажах...");
		// console.log(`🛍 Магазины: ${shopUuids.join(", ")}`);
		// console.log(`📅 Период: с ${since} по ${until}`);

		// Параллельно получаем документы и названия магазинов
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
					const name = await evo.getShopName(uuid);
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
