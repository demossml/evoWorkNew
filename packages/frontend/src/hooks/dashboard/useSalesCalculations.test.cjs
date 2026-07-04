const test = require("node:test");
const assert = require("node:assert/strict");
const { useSalesCalculations } = require("./useSalesCalculations.tsx");

test("useSalesCalculations computes net sales and average check from grand totals", () => {
	const data = {
		salesDataByShopName: {
			"Shop A": {
				sell: { CASH: 37942 },
				refund: { CASH: 7628 },
				totalSell: 37942,
				checksCount: 78,
			},
		},
		grandTotalSell: 37942,
		grandTotalRefund: 7628,
		netRevenue: 30314,
		averageCheck: 30314 / 78,
		grandTotalCashOutcome: 0,
		cashOutcomeData: {},
		totalChecks: 78,
		topProducts: [],
	};

	const result = useSalesCalculations(data);

	assert.equal(result.netSales, 30314);
	assert.equal(result.averageCheck, 30314 / 78);
});

test("useSalesCalculations returns zeros for empty input", () => {
	const result = useSalesCalculations(null);

	assert.equal(result.netSales, 0);
	assert.equal(result.averageCheck, 0);
	assert.equal(result.bestShop, null);
});
