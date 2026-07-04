import { useQuery } from "@tanstack/react-query";
import { client } from "@shared/api";

export interface SellerStoreMetrics {
  store: string;
  days: number;
  avgDailyRev: number;
  trend: number;
  cv: number;
}

export interface SellerMetrics {
  uuid: string;
  name: string;
  daysWorked: number;
  totalChecks: number;
  totalRevenue: number;
  avgDailyRev: number;
  avgCheck: number;
  checksPerDay: number;
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  cv: number;
  mad: number;
  vapeShare: number;
  accShare: number;
  stores: SellerStoreMetrics[];
  storeLabels: string[];
  efficiencyVsStore: number;
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
  dailyRevenue: { date: string; value: number }[];
  dow: Record<string, number>;  // day-of-week: "0"=Sun.."6"=Sat → avg revenue
  rank: number;                 // current position (1-based)
  prevRank: number | null;      // position in previous period
  deltaRank: number | null;     // prevRank - rank: positive = improved
  prevAvgDailyRev: number | null;
  targetAvgCheck: number;       // KPI target: средний чек
  targetVapeShare: number;      // KPI target: vape-доля %
  categoryBreakdown: { name: string; share: number }[];
  avgHours: number | null;       // avg shift duration from first→last sell
  rubPerHour: number | null;     // avgDailyRev / avgHours
}

export interface StoreBaseline {
  store: string;
  days: number;
  avgDailyRev: number;
  sd: number;
  cv: number;
  avgCheck: number;
}

export interface DowData {
  store: string;
  0: number; 1: number; 2: number; 3: number; 4: number; 5: number; 6: number;
  weekdayAvg: number;
  weekendAvg: number;
  dropPct: number;
}

export interface HypothesisResult {
  id: string;
  title: string;
  confirmed: boolean;
  summary: string;
}

export interface KpiSnapshot {
  totalRevenue: number;
  avgDailyRev: number;
  avgCheck: number;
  totalShifts: number;
  activeToday: number;
}

export interface SellerEffectivenessResponse {
  snapshot: KpiSnapshot;
  prevSnapshot: KpiSnapshot | null;
  sellers: SellerMetrics[];
  baselines: StoreBaseline[];
  dowData: DowData[];
  hypotheses: HypothesisResult[];
}

async function fetchSellerEffectiveness(params: {
  period?: number;
  since?: string;
  until?: string;
  store?: string;
}): Promise<SellerEffectivenessResponse> {
  const query: Record<string, string> = {};
  if (params.period) query.period = String(params.period);
  if (params.since) query.since = params.since;
  if (params.until) query.until = params.until;
  if (params.store && params.store !== "all") query.store = params.store;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.employees as any)["seller-effectiveness"].$get({ query });
  if (!res.ok) {
    throw new Error("Ошибка загрузки данных эффективности продавцов");
  }
  return res.json();
}

export function useSellerEffectiveness(params: {
  period?: number;
  since?: string;
  until?: string;
  store?: string;
  enabled?: boolean;
}) {
  return useQuery<SellerEffectivenessResponse>({
    queryKey: ["seller-effectiveness", params.period, params.since, params.until, params.store],
    queryFn: () => fetchSellerEffectiveness(params),
    staleTime: 5 * 60 * 1000, // 5 min cache
    enabled: params.enabled !== false,
  });
}
