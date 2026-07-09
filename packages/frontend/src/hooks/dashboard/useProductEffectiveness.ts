import { useQuery } from "@tanstack/react-query";
import { client } from "@shared/api";

export interface ProductStoreBreakdown {
  store: string;
  revenue: number;
  share: number;
}

export interface ProductCrossSell {
  productName: string;
  affinity: number;
}

export interface ProductHypothesis {
  id: string;
  title: string;
  confirmed: boolean;
  summary: string;
}

export interface ProductMetrics {
  productUuid: string;
  productName: string;
  categoryUuid: string | null;
  categoryName: string | null;
  netRevenue: number;
  netQuantity: number;
  grossProfit: number;
  marginPct: number;
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  dailyRevenue: { date: string; value: number }[];
  cv: number;
  categoryCv: number;
  cvVsCategory: number | null;
  refundRate: number;
  refundRateTrend: number;
  weeklyRefundRates: { week: string; rate: number }[];
  storeHHI: number;
  storeBreakdown: ProductStoreBreakdown[];
  crossSell: ProductCrossSell[];
  firstSaleDate: string | null;
  daysInAssortment: number;
  abcClass: "A" | "B" | "C";
  xyzClass: "X" | "Y" | "Z";
  segment: "star" | "cash_cow" | "problem" | "declining" | "new" | "local_hit";
  rank: number;
  rankEligible: boolean;
  hypotheses: ProductHypothesis[];

  // Расширенная аналитика
  healthScore: number;
  marginPercentile: number;
  cvPercentile: number;
  refundPercentile: number;
  anomalyDays: { date: string; value: number; direction: "up" | "down" }[];
  trendCI: { low: number; high: number; significant: boolean };
  waterfall: {
    prevRevenue: number; currRevenue: number; delta: number;
    avgCheckDelta: number; checksDelta: number; refundDelta: number;
  } | null;
  basketPenetration: number;
  prevNetRevenue: number | null;
  prevMarginPct: number | null;
  revenueChangePct: number | null;
  marginChangePts: number | null;
}

export interface ProductKpiSnapshot {
  totalSku: number;
  totalRevenue: number;
  totalGrossProfit: number;
  avgMarginPct: number;
  activeProducts: number;
}

export interface ProductEffectivenessResponse {
  snapshot: ProductKpiSnapshot;
  prevSnapshot: ProductKpiSnapshot | null;
  products: ProductMetrics[];
  hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[];
}

async function fetchProductEffectiveness(params: {
  period?: number;
  since?: string;
  until?: string;
  store?: string;
}): Promise<ProductEffectivenessResponse> {
  const query: Record<string, string> = {};
  if (params.period) query.period = String(params.period);
  if (params.since) query.since = params.since;
  if (params.until) query.until = params.until;
  if (params.store && params.store !== "all") query.store = params.store;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.products as any).effectiveness.$get({ query });
  if (!res.ok) {
    throw new Error("Ошибка загрузки данных эффективности товаров");
  }
  return res.json();
}

export function useProductEffectiveness(params: {
  period?: number;
  since?: string;
  until?: string;
  store?: string;
  enabled?: boolean;
}) {
  return useQuery<ProductEffectivenessResponse>({
    queryKey: ["product-effectiveness", params.period, params.since, params.until, params.store],
    queryFn: () => fetchProductEffectiveness(params),
    staleTime: 5 * 60 * 1000,
    enabled: params.enabled !== false,
  });
}
