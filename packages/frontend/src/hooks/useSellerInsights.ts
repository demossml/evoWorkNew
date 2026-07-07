/**
 * useSellerInsights — AI/rule-based insights for a single seller.
 *
 * Calls GET /api/sellers/insights?sellerId=...&since=...&until=...
 * When comparison context (shopName + peer IDs) is provided, the AI
 * generates store-level peer comparison insights rather than generic advice.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchSellerInsights } from "@shared/api";

export interface SellerInsightsParams {
  sellerId: string | null;
  since?: string;
  until?: string;
  shopId?: string;
  shopName?: string;
  compareSellerIds?: string[];
}

export function useSellerInsights(params: SellerInsightsParams) {
  const { sellerId, since, until, shopId, shopName, compareSellerIds } = params;

  const { data, isLoading, error } = useQuery({
    queryKey: ["seller-insights", sellerId, since, until, shopId, shopName, compareSellerIds],
    queryFn: () =>
      fetchSellerInsights({
        sellerId: sellerId!,
        since: since!,
        until: until!,
        shopId,
        shopName,
        compareSellerIds,
      }),
    enabled: !!sellerId && !!since && !!until,
    staleTime: 5 * 60 * 1000,
  });

  const insights = data?.insights ?? [];
  const fallback = error
    ? ["Не удалось загрузить инсайты. Попробуйте позже."]
    : [];

  return {
    insights: insights.length > 0 ? insights : fallback,
    isLoading,
  };
}
