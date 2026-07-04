import { client, fetchShops } from "@shared/api";

type ShopFilter = {
  shopName?: string;
  shopUuid?: string;
};

export async function fetchAnalyticsShops() {
  const json = await fetchShops();
  return Array.isArray(json.shopsNameAndUuid) ? json.shopsNameAndUuid : [];
}

export async function fetchProductDashboard() {
  const res = await (client.api.analytics.dashboards.product as any).$get();
  if (!res.ok) throw new Error("Не удалось загрузить Product dashboard");
  return res.json();
}

export async function fetchReliabilityDashboard() {
  const res = await (client.api.analytics.dashboards.reliability as any).$get();
  if (!res.ok) throw new Error("Не удалось загрузить Reliability dashboard");
  return res.json();
}

export async function fetchBusinessDashboard(filter?: ShopFilter) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const date = `${yyyy}-${mm}-${dd}`;

  const res = await (client.api.analytics.dashboards.business as any).$get({
    query: {
      since: date,
      until: date,
      shopUuid: filter?.shopUuid || undefined,
      shopName: filter?.shopName || undefined,
    },
  });

  if (!res.ok) throw new Error("Не удалось загрузить Business dashboard");
  return res.json();
}
