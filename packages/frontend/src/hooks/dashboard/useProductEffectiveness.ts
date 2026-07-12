import { useQuery } from "@tanstack/react-query";
import { client } from "@shared/api";

export interface ProductMetrics {
  uuid: string;
  name: string;
  category: string;
  abcClass: "A" | "B" | "C";
  daysListed: number;
  firstSoldDate: string | null;
  netRevenue: number;
  netQuantity: number;
  grossProfit: number;
  marginPct: number;
  averagePrice: number;
  refundRate: number;
  refundRateTrend: "↑" | "↓" | "→";
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  cv: number;
  categoryCv: number;
  storeConcentration: number;
  topStore: string | null;
  crossSell: { name: string; coOccurrencePct: number }[];
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
  dailyRevenue: { date: string; value: number }[];
  rankEligible: boolean;
}

export interface HypothesisResult {
  id: string;
  title: string;
  confirmed: boolean;
  summary: string;
}

export interface ProductEffectivenessResponse {
  products: ProductMetrics[];
  hypotheses: HypothesisResult[];
  since: string;
  until: string;
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
    throw new Error("Ошибка загрузки данных анализа товаров");
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
