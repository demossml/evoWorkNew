export interface RevenueSummary {
	netRevenue: number;
	averageCheck: number;
}

export function computeNetRevenue(
	grandTotalSell: number,
	grandTotalRefund: number,
): number {
	return grandTotalSell - grandTotalRefund;
}

export function computeAverageCheck(
	netRevenue: number,
	totalChecks: number,
): number {
	if (totalChecks <= 0) {
		return 0;
	}
	return netRevenue / totalChecks;
}

export function computeRevenueSummary(
	grandTotalSell: number,
	grandTotalRefund: number,
	totalChecks: number,
): RevenueSummary {
	const netRevenue = computeNetRevenue(grandTotalSell, grandTotalRefund);
	const averageCheck = computeAverageCheck(netRevenue, totalChecks);

	return {
		netRevenue,
		averageCheck,
	};
}
