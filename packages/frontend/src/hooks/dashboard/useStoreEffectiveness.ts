import { useQuery } from "@tanstack/react-query";
import { client } from "@shared/api";

export interface StoreMetrics {
  uuid: string;
  name: string;
  daysActive: number;
  netRevenue: number;
  netQuantity: number;
  grossProfit: number;
  marginPct: number;
  avgDailyRev: number;
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  cv: number;
  networkCv: number;
  revenuePerHour: number | null;
  revenuePerSeller: number;
  uniqueSellers: number;
  sellerTurnoverPct: number | null;
  categoryMix: { category: string; sharePct: number; networkSharePct: number; deviationPp: number }[];
  hourlyRevenue: { hour: number; avgRevenue: number }[];
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
  dailyRevenue: { date: string; value: number }[];
  rankEligible: boolean;
}

export interface OpeningCorrelation {
  sampleSize: number;
  correlation: number | null;
  interpretation: string;
}

export interface HypothesisResult {
  id: string;
  title: string;
  confirmed: boolean;
  summary: string;
}

export interface StoreEffectivenessResponse {
  stores: StoreMetrics[];
  openingCorrelation: OpeningCorrelation;
  hypotheses: HypothesisResult[];
  since: string;
  until: string;
}

async function fetchStoreEffectiveness(params: {
  period?: number;
  since?: string;
  until?: string;
}): Promise<StoreEffectivenessResponse> {
  const query: Record<string, string> = {};
  if (params.period) query.period = String(params.period);
  if (params.since) query.since = params.since;
  if (params.until) query.until = params.until;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.shops as any).effectiveness.$get({ query });
  if (!res.ok) {
    throw new Error("Ошибка загрузки данных анализа магазинов");
  }
  return res.json();
}

export function useStoreEffectiveness(params: {
  period?: number;
  since?: string;
  until?: string;
  enabled?: boolean;
}) {
  return useQuery<StoreEffectivenessResponse>({
    queryKey: ["store-effectiveness", params.period, params.since, params.until],
    queryFn: () => fetchStoreEffectiveness(params),
    staleTime: 5 * 60 * 1000,
    enabled: params.enabled !== false,
  });
}
