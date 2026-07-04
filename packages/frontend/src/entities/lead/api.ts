import { client } from "@shared/api";
import type { RawLead } from "./model";

const leadsApi = (client as any).api?.leads;

export async function fetchLeads(params?: {
  status?: string;
  limit?: number;
}) {
  if (!leadsApi?.$get) {
    return [] as RawLead[];
  }

  const response = await leadsApi.$get({
    query: params,
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить лиды");
  }

  const payload = await response.json();
  return Array.isArray(payload?.items) ? (payload.items as RawLead[]) : [];
}
