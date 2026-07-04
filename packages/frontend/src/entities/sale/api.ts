import { client } from "@shared/api";
import type { RawSale } from "./model";

const analyticsApi = (client as any).api?.analytics;

export async function fetchSalesByDate(params: { startDate: string; endDate: string }) {
  if (!analyticsApi?.sales?.$get) {
    return [] as RawSale[];
  }

  const response = await analyticsApi.sales.$get({
    query: params,
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить продажи");
  }

  const payload = await response.json();
  return Array.isArray(payload?.items) ? (payload.items as RawSale[]) : [];
}
