import { client } from "@shared/api";
import type { RawReport } from "./model";

const reportsApi = (client as any).api?.reports;

export async function fetchReports(params?: { date?: string; type?: string }) {
  if (!reportsApi?.$get) {
    return [] as RawReport[];
  }

  const response = await reportsApi.$get({
    query: params,
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить отчеты");
  }

  const payload = await response.json();
  return Array.isArray(payload?.items) ? (payload.items as RawReport[]) : [];
}
