/**
 * useSellerInsights — AI/rule-based insights for a single seller.
 *
 * Calls GET /api/sellers/insights?sellerId=...&since=...&until=...
 */
import { useQuery } from "@tanstack/react-query";
import { fetchSellerInsights } from "@shared/api/endpoints";

export function useSellerInsights(sellerId: string | null, since?: string, until?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["seller-insights", sellerId, since, until],
    queryFn: () =>
      fetchSellerInsights({
        sellerId: sellerId!,
        since: since!,
        until: until!,
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
