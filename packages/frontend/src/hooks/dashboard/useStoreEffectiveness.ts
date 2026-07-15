import { useQuery } from "@tanstack/react-query";
import { client } from "@shared/api";

export interface StoreMetrics {
  // raw backend fields
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
  hourlyRevenueWeekdayAvg: { hour: number; avgRevenue: number }[]; // среднее по таким же дням недели
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
  dailyRevenue: { date: string; value: number }[];
  rankEligible: boolean;
  utcOffset: number; // +N часов к UTC

  // UI aliases & computed
  shopUuid: string;
  shopName: string;
  totalRevenue: number;
  segment: string;
  healthScore: number;
  rank: number | null;
  clusterLabel: string | null;
  revenueChangePct: number | null;
  rubPerHour: number | null;
  revenuePercentile: number;
  marginPercentile: number;
  rubPerHourPercentile: number;
  trendCI: { significant: boolean } | null;
  cvVsNetwork: number | null;
  avgHoursPerDay: number | null;
  churnRate: number | null;
  newSellers: number;
  lostSellers: number;
  openingComplianceCorrelation: number | null;
  lateOpenDays: number;
  lateOpenRevenueImpact: number | null;
  categoryMixDelta: { category: string; delta: number }[];
  peakHourCoverage: { hour: number; revenue: number; networkAvgRevenue: number }[];
  anomalyDays: { date: string; value: number; direction: "up" | "down" }[];
  waterfall: { prevRevenue: number; currRevenue: number; delta: number; avgCheckDelta: number; checksDelta: number; refundDelta: number } | null;
  hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[];
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
  snapshot: {
    totalShops: number;
    totalRevenue: number;
    avgMarginPct: number;
    avgRubPerHour: number | null;
    totalSellers: number;
  } | null;
}

// ── Helpers ──

function segmentFromRisk(r: string): string {
  if (r === "critical") return "declining";
  if (r === "warn") return "volatile";
  return "healthy";
}

function healthFromRisk(r: string): number {
  if (r === "ok") return 80;
  if (r === "warn") return 50;
  return 25;
}

function pctRank(v: number, all: number[]): number {
  if (all.length < 2) return 50;
  const sorted = [...all].sort((a, b) => a - b);
  const idx = sorted.findIndex(x => x >= v);
  if (idx < 0) return 100;
  return Math.round((idx / (sorted.length - 1)) * 100);
}

function buildPeakHourCoverage(
  hourly: { hour: number; avgRevenue: number }[],
  weekdayAvg: { hour: number; avgRevenue: number }[],
): { hour: number; revenue: number; networkAvgRevenue: number }[] {
  const weekdayMap = new Map(weekdayAvg.map(w => [w.hour, w.avgRevenue]));
  return hourly.map(h => ({
    hour: h.hour,
    revenue: h.avgRevenue,
    networkAvgRevenue: weekdayMap.get(h.hour) ?? 0,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enrichStore(raw: any, idx: number, all: any[], openingCorr: OpeningCorrelation): StoreMetrics {
  const rubPerHour: number | null = raw.revenuePerHour ?? null;
  const cvVsNetwork: number | null = raw.cv > 0 && raw.networkCv > 0 ? +(raw.cv / raw.networkCv).toFixed(1) : null;

  return {
    uuid: raw.uuid,
    name: raw.name,
    daysActive: raw.daysActive,
    netRevenue: raw.netRevenue,
    netQuantity: raw.netQuantity,
    grossProfit: raw.grossProfit,
    marginPct: raw.marginPct,
    avgDailyRev: raw.avgDailyRev,
    trendSlope: raw.trendSlope,
    trendDirection: raw.trendDirection,
    trendR2: raw.trendR2,
    cv: raw.cv,
    networkCv: raw.networkCv,
    revenuePerHour: rubPerHour,
    revenuePerSeller: raw.revenuePerSeller,
    uniqueSellers: raw.uniqueSellers,
    sellerTurnoverPct: raw.sellerTurnoverPct,
    categoryMix: raw.categoryMix || [],
    hourlyRevenue: raw.hourlyRevenue || [],
    hourlyRevenueWeekdayAvg: raw.hourlyRevenueWeekdayAvg || [],
    riskLevel: raw.riskLevel,
    riskReasons: raw.riskReasons || [],
    dailyRevenue: raw.dailyRevenue || [],
    rankEligible: raw.rankEligible,
    utcOffset: raw.utcOffset ?? 3,
    // UI aliases
    shopUuid: raw.uuid,
    shopName: raw.name,
    totalRevenue: raw.netRevenue,
    segment: segmentFromRisk(raw.riskLevel),
    healthScore: healthFromRisk(raw.riskLevel),
    rank: raw.rankEligible ? idx + 1 : null,
    clusterLabel: null,
    revenueChangePct: null,
    rubPerHour,
    revenuePercentile: pctRank(raw.netRevenue, all.map((s: any) => s.netRevenue)),
    marginPercentile: pctRank(raw.marginPct, all.map((s: any) => s.marginPct)),
    rubPerHourPercentile: rubPerHour ? pctRank(rubPerHour, all.map((s: any) => s.revenuePerHour).filter(Boolean)) : 0,
    trendCI: { significant: (raw.trendR2 ?? 0) > 0.3 },
    cvVsNetwork,
    avgHoursPerDay: rubPerHour && raw.avgDailyRev > 0 ? +(raw.avgDailyRev / rubPerHour).toFixed(1) : null,
    churnRate: raw.sellerTurnoverPct ?? null,
    newSellers: 0,
    lostSellers: 0,
    openingComplianceCorrelation: openingCorr?.correlation ?? null,
    lateOpenDays: 0,
    lateOpenRevenueImpact: null,
    categoryMixDelta: (raw.categoryMix || []).map((c: any) => ({ category: c.category, delta: c.deviationPp })),
    peakHourCoverage: buildPeakHourCoverage(raw.hourlyRevenue || [], raw.hourlyRevenueWeekdayAvg || []),
    anomalyDays: [],
    waterfall: null,
    hypotheses: [],
  };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await res.json();
  const stores: StoreMetrics[] = (raw.stores || []).map((s: any, i: number) =>
    enrichStore(s, i, raw.stores, raw.openingCorrelation),
  );

  // Compute snapshot
  const eligible = stores.filter((s: StoreMetrics) => s.rankEligible);
  const snapshot = {
    totalShops: stores.length,
    totalRevenue: eligible.reduce((sum, s) => sum + s.netRevenue, 0),
    avgMarginPct: eligible.length > 0 ? Math.round(eligible.reduce((sum, s) => sum + s.marginPct, 0) / eligible.length * 10) / 10 : 0,
    avgRubPerHour: (() => {
      const vals = eligible.map(s => s.revenuePerHour).filter(Boolean) as number[];
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })(),
    totalSellers: eligible.reduce((sum, s) => sum + s.uniqueSellers, 0),
  };

  return {
    stores,
    openingCorrelation: raw.openingCorrelation,
    hypotheses: raw.hypotheses || [],
    since: raw.since,
    until: raw.until,
    snapshot,
  };
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
