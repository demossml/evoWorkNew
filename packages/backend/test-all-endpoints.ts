/**
 * test-all-endpoints.ts — методичный тест ВСЕХ эндпоинтов бэкенда.
 * Запуск: npx tsx test-all-endpoints.ts
 */

const BASE = "http://localhost:3000";
const GUEST_HEADERS = { "Content-Type": "application/json", "initData": "guest" };

async function test(method: string, path: string, body?: any, qs?: string): Promise<string> {
	const url = `${BASE}${path}${qs ? "?" + qs : ""}`;
	const opts: any = { method, headers: { ...GUEST_HEADERS } };
	if (body) opts.body = JSON.stringify(body);
	try {
		const res = await fetch(url, opts);
		const text = await res.text();
		const status = res.status;

		if (status >= 500) return `❌ ${status}`;
		if (status === 404) return `⚠️ 404`;
		if (status >= 400) return `⚠️ ${status}`;

		if (!text.trim()) return `⚠️ EMPTY`;

		try {
			JSON.parse(text);
			return `✓ ${status}`;
		} catch {
			return `⚠️ Not JSON (${text.slice(0, 60)})`;
		}
	} catch (e: any) {
		return `💥 ${e.message}`;
	}
}

// Общие ID для тестов
const SHOP_ID = "20191117-BF71-40FE-8016-1E7E4A3A4780";
const SHOP_ID_DB = "20251229-316B-40A1-80F7-C59E5B8E6831";
const EMPLOYEE_ID = "20260103-CA66-4070-80AB-4D01AD0A73FB";
const TODAY = "2026-07-04";

type TestCase = { label: string; method: string; path: string; body?: any; qs?: string };
const tests: TestCase[] = [
	// === GET endpoints ===
	{ label: "GET  /api/user", method: "GET", path: "/api/user" },
	{ label: "GET  /api/employee-name", method: "GET", path: "/api/employee-name" },
	{ label: "GET  /api/by-last-name-uuid", method: "GET", path: "/api/by-last-name-uuid", qs: "name=Иван" },
	{ label: "GET  /api/documents", method: "GET", path: "/api/documents", qs: "since=2026-01-01&until=2026-01-02" },
	{ label: "GET  /api/by-grammar", method: "GET", path: "/api/by-grammar" },
	{ label: "GET  /api/employee/name-uuid", method: "GET", path: "/api/employee/name-uuid" },
	{ label: "GET  /api/ai-report", method: "GET", path: "/api/ai-report", qs: "start=2026-01-01&end=2026-01-02" },
	{ label: "GET  /api/ai-association-rules", method: "GET", path: "/api/ai-association-rules", qs: "start=2026-01-01&end=2026-01-02" },
	{ label: "GET  /api/schedules", method: "GET", path: "/api/schedules", qs: "date=2026-07-04" },
	{ label: "GET  /api/shops", method: "GET", path: "/api/shops" },
	{ label: "GET  /api/employee-role", method: "GET", path: "/api/employee-role", qs: "id=123" },
	{ label: "GET  /api/evotor/sales-today", method: "GET", path: "/api/evotor/sales-today" },
	{ label: "GET  /api/evotor/sales-today-graf", method: "GET", path: "/api/evotor/sales-today-graf" },
	{ label: "GET  /api/evotor/plan-for-today", method: "GET", path: "/api/evotor/plan-for-today" },
	{ label: "GET  /api/evotor/groups", method: "GET", path: "/api/evotor/groups", qs: `shopUuid=${SHOP_ID}` },
	{ label: "GET  /api/evotor/shops-names", method: "GET", path: "/api/evotor/shops-names" },
	{ label: "GET  /api/evotor/sales-report", method: "GET", path: "/api/evotor/sales-report", qs: `shopUuid=${SHOP_ID}&startDate=${TODAY}&endDate=${TODAY}` },
	{ label: "GET  /api/evotor/shops", method: "GET", path: "/api/evotor/shops" },
	{ label: "GET  /api/evotor/report/financial/today", method: "GET", path: "/api/evotor/report/financial/today" },
	{ label: "GET  /api/admin/data-mode", method: "GET", path: "/api/admin/data-mode" },
	{ label: "GET  /api/analytics/revenue/hourly-plan-fact", method: "GET", path: "/api/analytics/revenue/hourly-plan-fact", qs: "date=2026-07-04" },
	{ label: "GET  /api/evotor/financial", method: "GET", path: "/api/evotor/financial", qs: `date=${TODAY}` },
	{ label: "GET  /api/evotor/current-work-shop", method: "GET", path: "/api/evotor/current-work-shop" },
	{ label: "GET  /api/evotor/stock-health", method: "GET", path: "/api/evotor/stock-health" },
	{ label: "GET  /api/evotor/stock-transfer", method: "GET", path: "/api/evotor/stock-transfer" },
	{ label: "GET  /api/evotor/working-by-shops", method: "GET", path: "/api/evotor/working-by-shops" },
	{ label: "GET  /api/employees/seller-effectiveness", method: "GET", path: "/api/employees/seller-effectiveness", qs: `startDate=${TODAY}&endDate=${TODAY}` },
	{ label: "GET  /api/revenue/accessories-report", method: "GET", path: "/api/revenue/accessories-report", qs: `startDate=${TODAY}&endDate=${TODAY}` },
	{ label: "GET  /api/evotor/stock-report", method: "GET", path: "/api/evotor/stock-report" },
	{ label: "GET  /api/openings/photos", method: "GET", path: "/api/openings/photos", qs: "date=2026-07-04" },
	{ label: "GET  /api/evotor/settings-config", method: "GET", path: "/api/evotor/settings-config" },
	{ label: "GET  /api/evotor/share-report/testkey", method: "GET", path: "/api/evotor/share-report/testkey" },

	// === POST endpoints (no body or minimal) ===
	{ label: "POST /api/evotor/shops", method: "POST", path: "/api/evotor/shops", body: {} },
	{ label: "POST /api/evotor/shops-names (GET)", method: "GET", path: "/api/evotor/shops-names" },
	{ label: "POST /api/evotor/groups-by-shop", method: "POST", path: "/api/evotor/groups-by-shop", body: { shopUuid: SHOP_ID_DB } },
	{ label: "POST /api/evotor/salary", method: "POST", path: "/api/evotor/salary", body: { employee: EMPLOYEE_ID, startDate: TODAY, endDate: TODAY } },
	{ label: "POST /api/evotor/sales-result", method: "POST", path: "/api/evotor/sales-result", body: { shopUuid: SHOP_ID_DB, startDate: TODAY, endDate: TODAY, groups: ["08a6bbac-8a53-11e8-b95f-c8d3ff286ecb"] } },
	{ label: "POST /api/evotor/salesResult", method: "POST", path: "/api/evotor/salesResult", body: { shopsUuid: [SHOP_ID_DB], startDate: TODAY, endDate: TODAY } },
	{ label: "POST /api/evotor/dead-stock", method: "POST", path: "/api/evotor/dead-stock", body: { shopUuid: SHOP_ID_DB, startDate: TODAY, endDate: TODAY, groups: ["08a6bbac-8a53-11e8-b95f-c8d3ff286ecb"] } },
	{ label: "POST /api/evotor/stock-report", method: "POST", path: "/api/evotor/stock-report", body: { shopUuid: SHOP_ID_DB, groups: ["08a6bbac-8a53-11e8-b95f-c8d3ff286ecb"] } },
	{ label: "POST /api/evotor/stock-summary", method: "POST", path: "/api/evotor/stock-summary", body: {} },
	{ label: "POST /api/evotor/order", method: "POST", path: "/api/evotor/order", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/evotor/order-v2", method: "POST", path: "/api/evotor/order-v2", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/evotor/submit-groups", method: "POST", path: "/api/evotor/submit-groups", body: { shopUuid: SHOP_ID_DB, groups: [{ uuid: "test", name: "test" }] } },
	{ label: "POST /api/evotor/sales-garden-report", method: "POST", path: "/api/evotor/sales-garden-report", body: { shopUuid: SHOP_ID_DB, startDate: TODAY, endDate: TODAY } },
	{ label: "POST /api/evotor/share-report", method: "POST", path: "/api/evotor/share-report", body: { shopUuid: [SHOP_ID], startDate: TODAY, endDate: TODAY } },
	{ label: "POST /api/evotor/dashboard-home-insights", method: "POST", path: "/api/evotor/dashboard-home-insights", body: { date: TODAY } },
	{ label: "POST /api/evotor/current-work-shop", method: "POST", path: "/api/evotor/current-work-shop", body: {} },
	{ label: "POST /api/evotor/generate-pdf", method: "POST", path: "/api/evotor/generate-pdf", body: {} },
	{ label: "POST /api/evotor/settings/accessory-groups", method: "POST", path: "/api/evotor/settings/accessory-groups", body: { groups: [] } },
	{ label: "POST /api/evotor/settings/salary-bonus", method: "POST", path: "/api/evotor/settings/salary-bonus", body: { bonuses: [] } },
	{ label: "POST /api/profit-report", method: "POST", path: "/api/profit-report", body: { shopUuid: [SHOP_ID], startDate: TODAY, endDate: TODAY } },
	{ label: "POST /api/is-open-store", method: "POST", path: "/api/is-open-store", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/open-store", method: "POST", path: "/api/open-store", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/finish-opening", method: "POST", path: "/api/finish-opening", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/stores/pos-sessions", method: "POST", path: "/api/stores/pos-sessions", body: { shopUuid: SHOP_ID, startDate: TODAY, endDate: TODAY } },
	{ label: "POST /api/stores/shops-opening-status", method: "POST", path: "/api/stores/shops-opening-status", body: { date: TODAY } },
	{ label: "POST /api/stores/open-store", method: "POST", path: "/api/stores/open-store", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/stores/finish-opening", method: "POST", path: "/api/stores/finish-opening", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/stores/is-open-store", method: "POST", path: "/api/stores/is-open-store", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/stores/openings-report", method: "POST", path: "/api/stores/openings-report", body: { startDate: TODAY, endDate: TODAY } },
	{ label: "POST /api/stores/opening-photos", method: "POST", path: "/api/stores/opening-photos", body: { shopUuid: SHOP_ID, date: TODAY } },
	{ label: "POST /api/employee/and-store/name-uuid", method: "POST", path: "/api/employee/and-store/name-uuid", body: { name: "Иван" } },
	{ label: "POST /api/schedules/table", method: "POST", path: "/api/schedules/table", body: { date: TODAY } },
	{ label: "POST /api/schedules/table-view", method: "POST", path: "/api/schedules/table-view", body: { date: TODAY } },
	{ label: "POST /api/dead-stocks/update", method: "POST", path: "/api/dead-stocks/update", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/deadStocks/update", method: "POST", path: "/api/deadStocks/update", body: { shopUuid: SHOP_ID } },
	{ label: "POST /api/ai/dashboard-summary2-insights", method: "POST", path: "/api/ai/dashboard-summary2-insights", body: { date: TODAY } },
	{ label: "POST /api/admin/data-mode", method: "POST", path: "/api/admin/data-mode", body: { mode: "test" } },
	{ label: "POST /api/analytics/event", method: "POST", path: "/api/analytics/event", body: { type: "test" } },
	{ label: "POST /api/internal/sync/documents", method: "POST", path: "/api/internal/sync/documents", body: {} },
];

async function main() {
	console.log("=".repeat(70));
	console.log("  ТЕСТ ВСЕХ ЭНДПОИНТОВ");
	console.log("=".repeat(70));

	let passed = 0, warn = 0, fail = 0;
	const failures: TestCase[] = [];

	for (const t of tests) {
		const result = await test(t.method, t.path, t.body, t.qs);
		console.log(`  ${result}  ${t.label}`);

		if (result.startsWith("✓")) passed++;
		else if (result.startsWith("⚠")) warn++;
		else { fail++; failures.push(t); }
	}

	console.log("\n" + "=".repeat(70));
	console.log(`  ИТОГО: ${tests.length} тестов`);
	console.log(`  ✓ OK:      ${passed}`);
	console.log(`  ⚠️ WARN:   ${warn}`);
	console.log(`  ❌ FAIL:   ${fail}`);
	console.log("=".repeat(70));

	if (failures.length > 0) {
		console.log("\nПРОВАЛЕННЫЕ ТЕСТЫ:");
		for (const f of failures) console.log(`  ❌ ${f.method} ${f.path}`);
	}
}

main();
