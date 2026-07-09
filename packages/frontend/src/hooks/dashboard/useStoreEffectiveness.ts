import { useQuery } from "@tanstack/react-query";
import { client } from "@shared/api";

export interface CategoryMixDelta {
  category: string;
  storeShare: number;
  networkShare: number;
  delta: number;
}

export interface PeakHourCoverage {
  hour: number;
  revenue: number;
  sellers: number;
  networkAvgRevenue: number;
  networkAvgSellers: number;
}

export interface StoreHypothesis {
  id: string;
  title: string;
  confirmed: boolean;
  summary: string;
}

export interface StoreMetrics {
  shopUuid: string;
  shopName: string;
  totalRevenue: number;
  totalGrossProfit: number;
  marginPct: number;
  avgDailyRev: number;
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  dailyRevenue: { date: string; value: number }[];
  cv: number;
  networkCv: number;
  cvVsNetwork: number | null;
  rubPerHour: number | null;
  avgHoursPerDay: number | null;
  revenuePerSeller: number | null;
  uniqueSellers: number;
  categoryMixDelta: CategoryMixDelta[];
  churnRate: number | null;
  newSellers: number;
  lostSellers: number;
  peakHourCoverage: PeakHourCoverage[];
  openingComplianceCorrelation: number | null;
  lateOpenDays: number;
  lateOpenRevenueImpact: number | null;
  segment: "healthy" | "declining" | "volatile" | "understaffed" | "assortment_gap" | "discipline_issue";
  rank: number;
  rankEligible: boolean;
  hypotheses: StoreHypothesis[];

  // Расширенная аналитика
  healthScore: number;
  revenuePercentile: number;
  marginPercentile: number;
  rubPerHourPercentile: number;
  anomalyDays: { date: string; value: number; direction: "up" | "down" }[];
  trendCI: { low: number; high: number; significant: boolean };
  waterfall: {
    prevRevenue: number; currRevenue: number; delta: number;
    avgCheckDelta: number; checksDelta: number; refundDelta: number;
  } | null;
  clusterLabel: "small" | "large" | null;
  prevTotalRevenue: number | null;
  prevMarginPct: number | null;
  revenueChangePct: number | null;
  marginChangePts: number | null;
}

export interface StoreKpiSnapshot {
  totalShops: number;
  totalRevenue: number;
  avgMarginPct: number;
  avgRubPerHour: number | null;
  totalSellers: number;
}

export interface NetworkBaseline {
  avgDailyRev: number;
  cv: number;
  categoryMix: { category: string; share: number }[];
  avgRubPerHour: number;
  peakHourRevenue: { hour: number; revenue: number }[];
}

export interface StoreEffectivenessResponse {
  snapshot: StoreKpiSnapshot;
  prevSnapshot: StoreKpiSnapshot | null;
  stores: StoreMetrics[];
  networkBaseline: NetworkBaseline;
  hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[];
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
    throw new Error("Ошибка загрузки данных эффективности магазинов");
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
