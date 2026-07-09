import { useQuery } from "@tanstack/react-query";
import { client } from "@shared/api";

export interface ProductAIInsight {
  product: string;
  issue?: string;
  opportunity?: string;
  severity?: "critical" | "warning" | "info";
  potential?: string;
}

export interface ProductAIResponse {
  executiveSummary: string;
  topIssues: ProductAIInsight[];
  topOpportunities: ProductAIInsight[];
  categoryInsight: string;
  actionableAdvice: string[];
}

async function fetchProductAIInsights(params: {
  period?: number;
  store?: string;
}): Promise<ProductAIResponse> {
  const query: Record<string, string> = {};
  if (params.period) query.period = String(params.period);
  if (params.store && params.store !== "all") query.store = params.store;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.products as any)["ai-insights"].$get({ query });
  if (!res.ok) {
    throw new Error("Ошибка загрузки AI-анализа товаров");
  }
  return res.json();
}

export function useProductAIInsights(params: {
  period?: number;
  store?: string;
  enabled?: boolean;
}) {
  return useQuery<ProductAIResponse>({
    queryKey: ["product-ai-insights", params.period, params.store],
    queryFn: () => fetchProductAIInsights(params),
    staleTime: 10 * 60 * 1000, // 10 min
    enabled: params.enabled !== false,
  });
}
