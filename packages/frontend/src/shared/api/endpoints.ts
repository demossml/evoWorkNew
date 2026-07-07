import { client } from "./client";
import {
  useDataSourceStore,
  type DataSource,
  type DataSourceMeta,
} from "../model/dataSourceStore";

// ============================================================================
// Helpers
// ============================================================================

type ShopBrief = { uuid: string; name: string };

function applyDataSourceMeta(meta: DataSourceMeta | null | undefined) {
  if (!meta) return;
  if (meta.source !== "DB" && meta.source !== "ELVATOR") return;
  useDataSourceStore.getState().setMeta(meta);
}

function getTodayDateString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiGet(path: string): Promise<any> {
  const res = await fetch(path, { headers: { initData: "guest" } });
  if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", initData: "guest" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || err?.message || `Ошибка: ${res.status}`);
  }
  return res.json();
}

// ============================================================================
// Employee
// ============================================================================

export async function fetchMe() {
  const res = await client.api.user.$get();
  if (!res.ok) throw new Error("Ошибка загрузки данных пользователя");
  return res.json();
}

export async function fetchEmployeeRole() {
  const res = await client.api["employee-role"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки роли сотрудника");
  return res.json();
}

export async function fetchEmployeeNameAndUuid() {
  const res = await client.api["by-last-name-uuid"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки данных сотрудника");
  return res.json();
}

// ============================================================================
// Schedules
// ============================================================================

export async function fetchSchedules() {
  const res = await client.api.schedules.$get();
  if (!res.ok) throw new Error("Ошибка загрузки расписания");
  return res.json();
}

// ============================================================================
// Working by shops
// ============================================================================

export async function fetchWorkingByShops() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.evotor as any)["working-by-shops"].$get();
  if (!res.ok) {
    throw new Error("Ошибка загрузки данных по сменам");
  }
  return res.json();
}

// ============================================================================
// Shops
// ============================================================================

export async function fetchShops() {
  const res = await client.api.shops.$get();
  if (!res.ok) throw new Error("Ошибка загрузки списка магазинов");
  const data = (await res.json()) as { shopsNameAndUuid: ShopBrief[] };
  return data;
}

export async function fetchShopNames() {
  const res = await client.api.shops.$get();
  if (!res.ok) throw new Error("Ошибка загрузки названий магазинов");
  const data = (await res.json()) as { shopsNameAndUuid: ShopBrief[] };
  return (data.shopsNameAndUuid || []).map((s) => s.name);
}

export async function fetchStoreList(): Promise<{ uuid: string; name: string }[]> {
  const res = await client.api.shops.$get();
  if (!res.ok) return [];
  const data = (await res.json()) as { shopsNameAndUuid: ShopBrief[] };
  return data.shopsNameAndUuid || [];
}

// ============================================================================
// Financial
// ============================================================================

export async function fetchFinancialForToday() {
  const res = await client.api.evotor["sales-today"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки отчёта");
  return res.json();
}

export async function fetchFinancialMetrics(params?: {
  since?: string;
  until?: string;
  shopUuid?: string;
}) {
  if (params?.since && params?.until) {
    // Period report via sales-garden-report
    const res = await client.api.evotor["sales-garden-report"].$post({
      json: {
        startDate: params.since,
        endDate: params.until,
      },
    });
    if (!res.ok) throw new Error("Ошибка загрузки данных");
    return res.json();
  }
  // Today — fallback to sales-today
  const res = await client.api.evotor["sales-today"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки данных");
  return res.json();
}

export async function fetchFinancialTodayForUser(params: {
  telegramId?: string;
  userId?: string;
}) {
  const res = await client.api.evotor["sales-today"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки данных");
  return res.json();
}

// ============================================================================
// Plan
// ============================================================================

export async function fetchPlanForToday() {
  const res = await client.api.evotor["plan-for-today"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки плана");
  return res.json();
}

export async function fetchReportAndPlanForToday() {
  const [reportData, planData] = await Promise.all([
    fetchFinancialForToday(),
    fetchPlanForToday(),
  ]);
  return {
    reportData,
    planData: planData.salesData ?? {},
  };
}

// ============================================================================
// Current work shop
// ============================================================================

export async function fetchCurrentWorkShop() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.evotor as any)["current-work-shop"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки данных о текущем магазине");
  return res.json();
}

// ============================================================================
// Open times (schedules per shop)
// ============================================================================

export async function fetchOpenTimes() {
  const res = await client.api.schedules.$get();
  if (!res.ok) throw new Error("Ошибка загрузки времени открытия магазинов");
  const raw = await res.json();
  return raw.dataReport || {};
}

// ============================================================================
// Sales graph
// ============================================================================

export async function fetchSalesTodayGraph() {
  const res = await client.api.evotor["sales-today-graf"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки данных графика");
  return res.json();
}

// ============================================================================
// Orders
// ============================================================================

export async function fetchGroupsByShop(shopUuid: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.evotor as any)["groups-by-shop"].$post({
    json: { shopUuid },
  });
  if (!res.ok) throw new Error(`Ошибка загрузки групп: ${res.status}`);
  return res.json();
}

export async function fetchOrderForecast(params: {
  startDate: string;
  endDate: string;
  shopUuid: string;
  groups: string[];
  period: number;
  userId: string;
}) {
  const res = await client.api.evotor.order.$post({ json: params });
  if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
  return res.json();
}

export async function fetchOrderForecastV2(params: {
  startDate: string;
  endDate: string;
  shopUuid: string;
  groups: string[];
  forecastHorizonDays?: number;
  leadTimeDays?: number;
  serviceLevel?: 0.8 | 0.9 | 0.95 | 0.98;
  budgetLimit?: number;
  analysisWeeks?: number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.evotor as any)["order-v2"].$post({ json: params });
  if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
  return res.json();
}

// ============================================================================
// Evotor shops (for user)
// ============================================================================

export async function fetchEvotorShops(userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.evotor as any).shops.$post({ json: { userId } });
  if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
  return res.json() as Promise<{ shopOptions: Record<string, string> }>;
}

// ============================================================================
// Data mode
// ============================================================================

export async function fetchDataMode() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.admin as any)["data-mode"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки режима данных");
  const data = (await res.json()) as { mode: DataSource; meta?: DataSourceMeta };
  applyDataSourceMeta(data.meta ?? null);
  return data;
}

export async function updateDataMode(mode: DataSource) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.admin as any)["data-mode"].$post({ json: { mode } });
  if (!res.ok) throw new Error("Ошибка смены режима данных");
  const data = (await res.json()) as { ok: boolean; mode: DataSource; meta?: DataSourceMeta };
  applyDataSourceMeta(data.meta ?? null);
  if (!data.meta && data.mode) {
    useDataSourceStore.getState().setMeta({ source: data.mode, aiAvailable: data.mode === "DB" });
  }
  return data;
}

// ============================================================================
// Store opening
// ============================================================================

export async function fetchIsStoreOpen(params: { userId: string; date: string }) {
  const res = await client.api["is-open-store"].$post({ json: params });
  if (!res.ok) return { exists: false };
  return res.json() as Promise<{ exists: boolean }>;
}

export async function saveStoreOpening(params: { userId: string; timestamp: string }) {
  const res = await client.api["open-store"].$post({ json: params });
  if (!res.ok) throw new Error("Ошибка сохранения открытия");
  return res.json();
}

export async function finishStoreOpening(params: {
  userId: string;
  ok: boolean;
  discrepancy?: { amount: number; type: string } | null;
}) {
  const res = await client.api["finish-opening"].$post({ json: params });
  if (!res.ok) throw new Error("Ошибка завершения открытия");
  return res.json();
}

export async function fetchOpeningPhotos(params: { date: string; shop: string }) {
  const res = await client.api["get-file"].$post({ json: params });
  if (!res.ok) throw new Error("Ошибка загрузки фото");
  return res.json();
}

// ============================================================================
// Photos upload
// ============================================================================

export async function uploadPhotosBatch(params: { files: { name: string; data: string; category: string }[] }) {
  const res = await client.api["upload-photos-batch"].$post({ json: params });
  if (!res.ok) throw new Error("Ошибка загрузки фото");
  return res.json();
}

export async function uploadPhoto(file: File) {
  const form = new FormData();
  form.append("file", file);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api["upload-photos"] as any).$post({ body: form } as any);
  if (!res.ok) throw new Error("Ошибка загрузки фото");
  return res.json();
}

// ============================================================================
// Dead stocks
// ============================================================================

export async function saveDeadStocks(params: {
  shopUuid: string;
  items: { productName: string; sku: string; quantity: number }[];
}) {
  const res = await client.api["dead-stocks"].update.$post({ json: params });
  if (!res.ok) throw new Error("Ошибка сохранения dead stock");
  return res.json();
}

// ============================================================================
// Profit report
// ============================================================================

export async function fetchProfitReport(params: {
  shopUuids: string[];
  since: string;
  until: string;
  dataFrom1C: Record<string, { expenses: number; grossProfit: number }>;
}) {
  const res = await client.api["profit-report"].$post({ json: params });
  if (!res.ok) throw new Error("Ошибка загрузки отчёта о прибыли");
  return res.json();
}

// ============================================================================
// AI staff report
// ============================================================================

export async function fetchAiStaffReport() {
  const res = await client.api["ai-report"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки AI отчёта");
  return res.json();
}

// ============================================================================
// Stock report
// ============================================================================

export async function fetchStockReport() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.evotor as any)["stock-report"].$get();
  if (!res.ok) throw new Error("Ошибка загрузки stock отчёта");
  return res.json();
}

export async function fetchStockSummary(params: {
  shopUuid: string;
  groups: string[];
  startDate: string;
  endDate: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.evotor as any)["stock-summary"].$post({ json: params });
  if (!res.ok) throw new Error("Ошибка загрузки stock summary");
  return res.json();
}

// ============================================================================
// Sales garden report
// ============================================================================

export async function fetchSalesGardenReport(params: {
  startDate: string;
  endDate: string;
}) {
  const res = await client.api.evotor["sales-garden-report"].$post({ json: params });
  if (!res.ok) throw new Error("Ошибка загрузки sales garden");
  return res.json();
}

// ============================================================================
// Sellers
// ============================================================================

export async function fetchSellerAdvancedStats(params: {
  since: string;
  until: string;
  shopId?: string;
  sellerIds?: string[];
  benchmarkWeekday?: number;
  weekday?: number;
}) {
  const q = new URLSearchParams({ since: params.since, until: params.until });
  if (params.shopId) q.set("shopId", params.shopId);
  if (params.sellerIds && params.sellerIds.length > 0) q.set("sellerIds", params.sellerIds.join(","));
  if (params.benchmarkWeekday !== undefined) q.set("benchmarkWeekday", String(params.benchmarkWeekday));
  if (params.weekday !== undefined) q.set("weekday", String(params.weekday));
  const res = await apiGet(`/api/sellers/advanced-stats?${q.toString()}`);
  return (res as any).sellers ?? [];
}

export async function fetchSellerInsights(params: {
  sellerId: string;
  since: string;
  until: string;
  shopId?: string;
  shopName?: string;
  compareSellerIds?: string[];
}) {
  const q = new URLSearchParams({
    sellerId: params.sellerId,
    since: params.since,
    until: params.until,
  });
  if (params.shopId) q.set("shopId", params.shopId);
  if (params.shopName) q.set("shopName", params.shopName);
  if (params.compareSellerIds && params.compareSellerIds.length > 0) {
    q.set("compareSellerIds", params.compareSellerIds.join(","));
  }
  const res = await apiGet(`/api/sellers/insights?${q.toString()}`);
  return res as { insights: string[] };
}

export async function fetchWeekdayCompare(params: {
  targetDate: string;
  shopId?: string;
  weeksBack?: number;
  compareMode?: "same-day" | "same-weekday";
  sellerIds?: string[];
}) {
  const q = new URLSearchParams({ targetDate: params.targetDate });
  if (params.shopId) q.set("shopId", params.shopId);
  if (params.weeksBack) q.set("weeksBack", String(params.weeksBack));
  if (params.compareMode) q.set("compareMode", params.compareMode);
  if (params.sellerIds && params.sellerIds.length > 0) q.set("sellerIds", params.sellerIds.join(","));
  const res = await apiGet(`/api/sellers/weekday-compare?${q.toString()}`);
  return res as { weekday: number; dates: string[]; sellers: import("@/widgets/sellers/SellerDNAWidget/types").WeekdayCompareProfile[]; recommendation?: { message: string; bestWeekday?: number; bestWeekdayLabel?: string; bestCount?: number } };
}

export async function fetchWeekdayBreakdown(params: {
  sellerId: string;
  since: string;
  until: string;
}) {
  const q = new URLSearchParams({
    sellerId: params.sellerId,
    since: params.since,
    until: params.until,
  }).toString();
  const res = await apiGet(`/api/sellers/weekday-breakdown?${q}`);
  return res as Record<number, { days: number; totalRevenue: number; totalChecks: number; avgCheck: number; rubPerHour: number | null }>;
}
