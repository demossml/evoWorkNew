export interface FinancialAggregationTransaction {
	type?: string;
	paymentType?: string | null;
	sum?: number | null;
}

export interface FinancialAggregationDocument {
	type: string;
	transactions?: FinancialAggregationTransaction[] | null;
}

export interface ShopFinancialAggregation {
	sell: Record<string, number>;
	refund: Record<string, number>;
	totalSell: number;
	totalRefund: number;
	checksCount: number;
}

export function aggregateShopFinancialFromDocuments(
	documents: FinancialAggregationDocument[],
	paymentTypeLabels: Record<string, string>,
): ShopFinancialAggregation {
	const sell: Record<string, number> = {};
	const refund: Record<string, number> = {};
	let totalSell = 0;
	let totalRefund = 0;
	let checksCount = 0;

	for (const doc of documents) {
		const isRefundDoc = doc.type === "PAYBACK";
		checksCount += 1;

		for (const trans of doc.transactions || []) {
			if (trans.type !== "PAYMENT" || !trans.paymentType) continue;

			const label =
				paymentTypeLabels[trans.paymentType] || paymentTypeLabels.UNKNOWN;
			const rawAmount = Number(trans.sum || 0);
			if (rawAmount === 0) continue;

			if (isRefundDoc) {
				const amount = Math.abs(rawAmount);
				refund[label] = (refund[label] || 0) + amount;
				totalRefund += amount;
			} else {
				// SELL учитывает signed-сумму; отрицательная PAYMENT в чеке
				// трактуется как сдача, а не возврат.
				sell[label] = (sell[label] || 0) + rawAmount;
				totalSell += rawAmount;
			}
		}
	}

	return {
		sell,
		refund,
		totalSell,
		totalRefund,
		checksCount,
	};
}
