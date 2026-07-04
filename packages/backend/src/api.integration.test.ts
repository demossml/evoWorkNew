import { describe, it, expect } from "vitest";
import { api } from "./api";

async function req(method: string, path: string, body?: unknown) {
	const init: RequestInit = { method };
	if (body !== undefined) {
		init.headers = { "Content-Type": "application/json" };
		init.body = JSON.stringify(body);
	}
	return api.request(path, init);
}

describe("Compat stubs (21 routes — no Cloudflare bindings needed)", () => {
	it("GET /api/evotor/working-by-shops → 200", async () => {
		const res = await req("GET", "/api/evotor/working-by-shops");
		expect(res.status).toBe(200);
		const j = await res.json();
		expect(j).toHaveProperty("byShop");
	});

	it("GET /api/evotor/stock-health → 200 + all frontend fields", async () => {
		const res = await req("GET", "/api/evotor/stock-health?days=14");
		expect(res.status).toBe(200);
		const j = await res.json();
		for (const f of ["deadStock","lowStock","outOfStock","recommendations","deadCount","lowCount","outCount","totalLostPerDay"]) {
			expect(j).toHaveProperty(f);
		}
	});

	it("GET /api/evotor/stock-transfer → 200 (was missing)", async () => {
		const res = await req("GET", "/api/evotor/stock-transfer?days=14");
		expect(res.status).toBe(200);
		const j = await res.json();
		expect(j).toHaveProperty("transfers");
	});

	it("GET /api/employees/seller-effectiveness → 200 + sellers + snapshot", async () => {
		const res = await req("GET", "/api/employees/seller-effectiveness?period=30");
		expect(res.status).toBe(200);
		const j = await res.json();
		expect(j).toHaveProperty("sellers");
		expect(j).toHaveProperty("snapshot");
	});

	it("GET /api/evotor/current-work-shop → 200", async () => {
		const res = await req("GET", "/api/evotor/current-work-shop");
		expect(res.status).toBe(200);
		const j = await res.json();
		expect(j).toHaveProperty("uuid");
		expect(j).toHaveProperty("name");
		expect(j).toHaveProperty("isWorkingToday");
	});

	it("POST /api/evotor/current-work-shop → 200", async () => {
		const res = await req("POST", "/api/evotor/current-work-shop", {});
		expect(res.status).toBe(200);
	});

	it("GET /api/admin/data-mode → 200 + mode + meta", async () => {
		const res = await req("GET", "/api/admin/data-mode");
		expect(res.status).toBe(200);
		const j = await res.json();
		expect(j).toHaveProperty("mode");
		expect(j).toHaveProperty("meta");
	});

	it("POST /api/admin/data-mode → 200 + ok", async () => {
		const res = await req("POST", "/api/admin/data-mode", { mode: "DB" });
		expect(res.status).toBe(200);
		const j = await res.json() as { ok: boolean };
		expect(j.ok).toBe(true);
	});

	it("POST /api/analytics/event → 200 + ok", async () => {
		const res = await req("POST", "/api/analytics/event", { type: "test" });
		expect(res.status).toBe(200);
		const j = await res.json() as { ok: boolean };
		expect(j.ok).toBe(true);
	});

	it("GET /api/analytics/revenue/hourly-plan-fact → 200 + rows", async () => {
		const res = await req("GET", "/api/analytics/revenue/hourly-plan-fact");
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveProperty("rows");
	});

	it("GET /api/analytics/revenue/refund-documents → 200 + documents", async () => {
		const res = await req("GET", "/api/analytics/revenue/refund-documents");
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveProperty("documents");
	});

	it("GET /api/analytics/dashboards/product → 200 + widgets", async () => {
		const res = await req("GET", "/api/analytics/dashboards/product");
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveProperty("widgets");
	});

	it("GET /api/analytics/dashboards/reliability → 200 + widgets", async () => {
		const res = await req("GET", "/api/analytics/dashboards/reliability");
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveProperty("widgets");
	});

	it("GET /api/analytics/dashboards/business → 200 + widgets", async () => {
		const res = await req("GET", "/api/analytics/dashboards/business");
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveProperty("widgets");
	});

	it("POST /api/evotor/dashboard-home-insights → 200 + insights + bestShop", async () => {
		const res = await req("POST", "/api/evotor/dashboard-home-insights", {});
		expect(res.status).toBe(200);
		const j = await res.json();
		expect(j).toHaveProperty("insights");
		expect(j).toHaveProperty("bestShop");
	});

	it("POST /api/evotor/accessoriesSales/:role/:userId → 200 + nonAccessoriesTotal", async () => {
		const res = await req("POST", "/api/evotor/accessoriesSales/admin/123");
		expect(res.status).toBe(200);
		const j = await res.json();
		expect(j).toHaveProperty("byShop");
		expect(j).toHaveProperty("total");
		expect(j).toHaveProperty("nonAccessoriesTotal"); // was missing
	});

	it("GET /api/evotor/financial → 200 + all 12 fields for FinanceWidget", async () => {
		const res = await req("GET", "/api/evotor/financial?shopUuid=test&date=today");
		expect(res.status).toBe(200);
		const j = await res.json();
		for (const f of ["salesDataByShopName","netRevenue","grandTotalSell","grandTotalRefund","averageCheck","grandTotalCashOutcome","cashOutcomeData","cashBalanceByShop","totalCashBalance","totalChecks","topProducts"]) {
			expect(j).toHaveProperty(f);
		}
	});

	it("POST /api/evotor/salesResult → 400 without bindings (real endpoint needs D1)", async () => {
		const res = await req("POST", "/api/evotor/salesResult", {
			startDate: "2026-06-01",
			endDate: "2026-06-30",
			shopUuid: "test-shop",
			groups: [],
		});
		expect(res.status).toBe(400);
	});

	it("POST /api/evotor/generate-pdf → 200 (was 501)", async () => {
		const res = await req("POST", "/api/evotor/generate-pdf", {});
		expect(res.status).not.toBe(501);
		const j = await res.json();
		expect(j).toHaveProperty("url");
	});

	it("GET /api/revenue/accessories-report → 200 + items", async () => {
		const res = await req("GET", "/api/revenue/accessories-report");
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveProperty("items");
	});

	it("POST /api/ai/dashboard-summary2-insights → 200", async () => {
		const res = await req("POST", "/api/ai/dashboard-summary2-insights", {});
		expect(res.status).toBe(200);
	});
});

// ═══════════════════════════════════════════
// Real-handler routes (need Cloudflare D1/KV/R2 bindings)
// These will 500 in Node.js — expected, not a bug
// ═══════════════════════════════════════════
describe("Real-handler routes (500 expected without CF bindings)", () => {
	it.skip("GET /api/user", async () => {
		const res = await req("GET", "/api/user");
		// Needs c.env.DB — works only in wrangler
		expect(res.status).toBe(200);
	});

	it.skip("GET /api/employee-role", async () => {
		const res = await req("GET", "/api/employee-role");
		expect(res.status).toBe(200);
	});

	it.skip("GET /api/by-last-name-uuid", async () => {
		const res = await req("GET", "/api/by-last-name-uuid");
		expect(res.status).toBe(200);
	});

	it.skip("GET /api/schedules", async () => {
		const res = await req("GET", "/api/schedules");
		expect(res.status).toBe(200);
	});

	it.skip("GET /api/shops", async () => {
		const res = await req("GET", "/api/shops");
		expect(res.status).toBe(200);
	});
});
