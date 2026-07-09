// ============================================================================
// orderForecastV2 — SMA + ABC/XYZ анализ для прогноза закупок
// Адаптировано из demossml/workApp
// ============================================================================

import type { D1Database } from "@cloudflare/workers-types";
import type { Evotor } from "../evotor";
import { classifyABC, classifyXYZ } from "./sharedStats";

// ── Типы ────────────────────────────────────────────────────────────────────

export interface OrderForecastV2Input {
	db: D1Database;
	evotor: Evotor;
	shopUuid: string;
	groups: string[];
	startDate: string; // YYYY-MM-DD — начало периода, на который нужен товар
	endDate: string; // YYYY-MM-DD — конец периода
	forecastHorizonDays?: number;
	leadTimeDays?: number;
	serviceLevel?: 0.8 | 0.9 | 0.95 | 0.98;
	budgetLimit?: number | null;
	analysisWeeks?: number; // сколько недель истории анализировать (по умолчанию 4)
}

export interface OrderForecastV2Item {
	productUuid: string;
	productName: string;
	abcClass: "A" | "B" | "C";
	xyzClass: "X" | "Y" | "Z";
	currentStock: number;
	availableStock: number;
	avgDailyDemand: number;
	demandStdDev: number;
	safetyStock: number;
	reorderPoint: number;
	targetStock: number;
	recommendedOrderRounded: number;
	unitCost: number;
	orderCost: number;
	expectedCoverageDays: number;
	confidence: number; // 0–1, качество прогноза
	reasonCodes: string[]; // ключевые факторы, повлиявшие на рекомендацию
}

export interface OrderForecastV2Result {
	period: { startDate: string; endDate: string };
	assumptions: {
		forecastHorizonDays: number;
		leadTimeDays: number;
		serviceLevel: number;
	};
	summary: {
		totalOrderCost: number;
		skuCount: number;
		constrainedByBudget: boolean;
	};
	items: OrderForecastV2Item[];
}

// ── Константы ────────────────────────────────────────────────────────────────

const Z_SCORES: Record<number, number> = {
	0.8: 0.84,
	0.9: 1.28,
	0.95: 1.65,
	0.98: 2.05,
};

// ── Хелперы ──────────────────────────────────────────────────────────────────

function parseTransactions(
	transactions: string | null | undefined,
): { commodityUuid: string; quantity: number }[] {
	if (!transactions) return [];
	try {
		const arr = JSON.parse(transactions) as unknown[];
		return (arr || [])
			.filter(
				(t: any) =>
					t?.commodityUuid && typeof t?.quantity === "number",
			)
			.map((t: any) => ({
				commodityUuid: t.commodityUuid,
				quantity: t.quantity,
			}));
	} catch {
		return [];
	}
}

function sma(values: number[], window: number): number {
	if (values.length === 0) return 0;
	const slice = values.slice(-window);
	return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function stdDev(values: number[]): number {
	if (values.length < 2) return 0;
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const variance =
		values.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
		(values.length - 1);
	return Math.sqrt(variance);
}

function coefficientOfVariation(mean: number, std: number): number {
	if (mean === 0) return 999;
	return std / mean;
}

// ── Основная функция ─────────────────────────────────────────────────────────

export async function runOrderForecastV2(
	input: OrderForecastV2Input,
): Promise<OrderForecastV2Result> {
	const {
		db,
		evotor,
		shopUuid,
		groups,
		startDate,
		endDate,
		forecastHorizonDays = 14,
		leadTimeDays = 3,
		serviceLevel = 0.9,
		budgetLimit = null,
		analysisWeeks = 4,
	} = input;

	const zScore = Z_SCORES[serviceLevel];

	// 1. Получаем SELL-документы из index_documents
	//    Окно анализа: от (startDate - analysisWeeks недель) до (startDate - 1 день)
	//    Если startDate в будущем — смотрим историю до startDate
	const analysisStart = new Date(startDate + "T00:00:00");
	analysisStart.setDate(analysisStart.getDate() - analysisWeeks * 7);
	const analysisEnd = new Date(startDate + "T00:00:00");
	analysisEnd.setDate(analysisEnd.getDate() - 1);

	const pad = (n: number) => String(n).padStart(2, "0");
	const since = `${analysisStart.getFullYear()}-${pad(analysisStart.getMonth() + 1)}-${pad(analysisStart.getDate())}T00:00:00.000+0000`;
	const until = `${analysisEnd.getFullYear()}-${pad(analysisEnd.getMonth() + 1)}-${pad(analysisEnd.getDate())}T23:59:59.000+0000`;

	const docsResult = await db
		.prepare(
			`SELECT number, close_date, transactions
			 FROM index_documents
			 WHERE shop_id = ?
			   AND close_date >= ?
			   AND close_date <= ?
			   AND type = 'SELL'
			 ORDER BY close_date ASC`,
		)
		.bind(shopUuid, since, until)
		.all<{ number: string; close_date: string; transactions: string }>();

	const docs = docsResult.results || [];

	// 2. Получаем ВСЕ продукты магазина ОДНИМ запросом
	//    (getProductsByGroup и getProductStockByGroups тоже дёргают getProducts внутри —
	//     объединяем в один вызов чтобы не ходить в API 3 раза)
	const groupSet = new Set(groups);
	const allProducts = await evotor.getProducts(shopUuid);
	const allItems = Array.isArray(allProducts) ? allProducts : (allProducts.items || []);

	const productGroupUuids = new Set<string>();
	const productInfo = new Map<string, { name: string; cost: number }>();
	const stockMap = new Map<string, number>();

	for (const p of allItems) {
		// Фильтруем: принадлежит ли товар к нужным группам и есть ли остаток
		if (p.parentUuid && groupSet.has(p.parentUuid)) {
			productGroupUuids.add(p.uuid);
			productInfo.set(p.uuid, {
				name: p.name || p.uuid,
				cost: p.price || 0,
			});
			const qty = (p as any).quantity ?? 0;
			if (qty > 0) {
				stockMap.set(p.uuid, qty);
			}
		}
	}

	// 5. Агрегируем продажи по дням и продуктам
	// salesByProduct[productUuid] = number[] (ежедневные продажи)
	const salesByProduct = new Map<string, number[]>();
	const dailyTotals = new Map<string, number>(); // date → total quantity

	for (const doc of docs) {
		const dateKey = (doc.close_date || "").slice(0, 10);
		const txs = parseTransactions(doc.transactions);
		for (const tx of txs) {
			if (!productGroupUuids.has(tx.commodityUuid)) continue;
			const series = salesByProduct.get(tx.commodityUuid) || [];
			// группируем по дням
			const existingDay = dailyTotals.get(dateKey + tx.commodityUuid) || 0;
			dailyTotals.set(dateKey + tx.commodityUuid, existingDay + tx.quantity);
			series.push(tx.quantity);
			salesByProduct.set(tx.commodityUuid, series);
		}
	}

	// Пересчитываем: каждый день одна точка данных
	const salesByProductDaily = new Map<string, number[]>();
	const days = new Set<string>();
	for (const doc of docs) {
		days.add((doc.close_date || "").slice(0, 10));
	}
	const sortedDays = [...days].sort();

	for (const [uuid, _] of salesByProduct) {
		const daily: number[] = [];
		for (const day of sortedDays) {
			daily.push(dailyTotals.get(day + uuid) || 0);
		}
		salesByProductDaily.set(uuid, daily);
	}

	// 6. ABC-классификация по общей выручке (переиспользует sharedStats.classifyABC)
	const revenueByProduct = new Map<string, number>();
	for (const [uuid, dailySales] of salesByProductDaily) {
		const totalQty = dailySales.reduce((a, b) => a + b, 0);
		const info = productInfo.get(uuid);
		const cost = info?.cost || 0;
		revenueByProduct.set(uuid, totalQty * cost);
	}

	const abcItems = [...revenueByProduct.entries()].map(([key, value]) => ({ key, value }));
	const abcMap = classifyABC(abcItems);

	// 7. XYZ-классификация по стабильности спроса (переиспользует sharedStats.classifyXYZ)
	const xyzItems: { key: string; cv: number }[] = [];
	for (const [uuid, dailySales] of salesByProductDaily) {
		const nonZero = dailySales.filter((v) => v > 0);
		const mean = nonZero.length > 0
			? nonZero.reduce((a, b) => a + b, 0) / nonZero.length
			: 0;
		const stdev = stdDev(nonZero);
		const cv = coefficientOfVariation(mean, stdev);
		xyzItems.push({ key: uuid, cv });
	}
	const xyzMap = classifyXYZ(xyzItems);

	// 8. Прогноз и рекомендации
	const smaWindow = Math.min(7, sortedDays.length);
	const items: OrderForecastV2Item[] = [];
	let totalOrderCost = 0;

	for (const [uuid, dailySales] of salesByProductDaily) {
		const info = productInfo.get(uuid);
		if (!info) continue;

		const avgDemand = sma(dailySales, smaWindow);
		const stdev = stdDev(dailySales);
		const stock = stockMap.get(uuid) || 0;
		const availableStock = Math.max(0, stock);

		// Страховой запас
		const safetyStock = zScore * stdev * Math.sqrt(leadTimeDays);

		// Точка перезаказа
		const reorderPoint = avgDemand * leadTimeDays + safetyStock;

		// Целевой запас (покрытие на forecastHorizonDays + страховой)
		const targetStock =
			avgDemand * forecastHorizonDays + safetyStock;

		// Рекомендуемый заказ
		const recommended = targetStock - availableStock;
		const recommendedRounded = Math.max(0, Math.ceil(recommended));

		const unitCost = info.cost;
		const orderCost = recommendedRounded * unitCost;
		const expectedCoverageDays =
			avgDemand > 0
				? (availableStock + recommendedRounded) / avgDemand
				: 999;

		// Доверие к прогнозу: база — XYZ, корректируем по кол-ву дней с данными
		const xyz = xyzMap.get(uuid) || "Z";
		const baseConf = { X: 0.95, Y: 0.75, Z: 0.5 }[xyz];
		const daysWithSales = dailySales.filter((v) => v > 0).length;
		const dataRatio = Math.min(1, daysWithSales / 7);
		const confidence = Math.round(baseConf * (0.5 + 0.5 * dataRatio) * 100) / 100;

		// Причины рекомендации
		const totalSold = dailySales.reduce((a, b) => a + b, 0);
		const reasonCodes: string[] = [];
		if (stock <= 0) reasonCodes.push("NO_STOCK");
		else if (stock < reorderPoint) reasonCodes.push("LOW_STOCK");
		if (avgDemand > 1 && recommendedRounded > 0) reasonCodes.push("HIGH_DEMAND");
		if (xyz === "Z") reasonCodes.push("HIGH_VARIABILITY");
		else if (xyz === "X") reasonCodes.push("STABLE");
		if (daysWithSales < 3) reasonCodes.push("NEW_PRODUCT");
		if (availableStock > targetStock && recommendedRounded === 0)
			reasonCodes.push("OVERSTOCK");
		if (totalSold === 0) reasonCodes.push("NO_SALES");
		if (unitCost > 0 && recommendedRounded > 0 && recommendedRounded * unitCost > 5000)
			reasonCodes.push("HIGH_VALUE");
		if (reasonCodes.length === 0) reasonCodes.push("BALANCED");

		items.push({
			productUuid: uuid,
			productName: info.name,
			abcClass: abcMap.get(uuid) || "C",
			xyzClass: xyz,
			currentStock: stock,
			availableStock,
			avgDailyDemand: Math.round(avgDemand * 100) / 100,
			demandStdDev: Math.round(stdev * 100) / 100,
			safetyStock: Math.round(safetyStock * 100) / 100,
			reorderPoint: Math.round(reorderPoint * 100) / 100,
			targetStock: Math.round(targetStock * 100) / 100,
			recommendedOrderRounded: recommendedRounded,
			unitCost,
			orderCost,
			expectedCoverageDays: Math.round(expectedCoverageDays * 100) / 100,
			confidence,
			reasonCodes,
		});

		totalOrderCost += orderCost;
	}

	// Сортируем: A → B → C, потом по убыванию стоимости заказа
	const classOrder = { A: 0, B: 1, C: 2 };
	items.sort((a, b) => {
		const cls = classOrder[a.abcClass] - classOrder[b.abcClass];
		if (cls !== 0) return cls;
		return b.orderCost - a.orderCost;
	});

	// Бюджетное ограничение
	let constrainedByBudget = false;
	if (budgetLimit != null && budgetLimit > 0 && totalOrderCost > budgetLimit) {
		constrainedByBudget = true;
		let running = 0;
		for (const item of items) {
			if (running + item.orderCost > budgetLimit) {
				// Пропорционально обрезаем
				const remaining = budgetLimit - running;
				if (remaining <= 0) {
					item.recommendedOrderRounded = 0;
					item.orderCost = 0;
				} else {
					const ratio = remaining / item.orderCost;
					item.recommendedOrderRounded = Math.floor(
						item.recommendedOrderRounded * ratio,
					);
					item.orderCost = item.recommendedOrderRounded * item.unitCost;
				}
			}
			running += item.orderCost;
		}
		totalOrderCost = items.reduce((s, i) => s + i.orderCost, 0);
	}

	return {
		period: { startDate, endDate },
		assumptions: {
			forecastHorizonDays,
			leadTimeDays,
			serviceLevel,
		},
		summary: {
			totalOrderCost,
			skuCount: items.filter((i) => i.recommendedOrderRounded > 0).length,
			constrainedByBudget,
		},
		items,
	};
}
