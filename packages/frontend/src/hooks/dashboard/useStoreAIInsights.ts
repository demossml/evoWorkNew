import { useQuery } from "@tanstack/react-query";
import { client } from "@shared/api";

export interface StoreAIInsight {
  store: string;
  issue?: string;
  opportunity?: string;
  severity?: "critical" | "warning" | "info";
  potential?: string;
}

export interface StoreAIResponse {
  executiveSummary: string;
  topIssues: StoreAIInsight[];
  topOpportunities: StoreAIInsight[];
  disciplineInsight: string;
  actionableAdvice: string[];
}

async function fetchStoreAIInsights(params: {
  period?: number;
}): Promise<StoreAIResponse> {
  const query: Record<string, string> = {};
  if (params.period) query.period = String(params.period);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.api.shops as any)["ai-insights"].$get({ query });
  if (!res.ok) {
    throw new Error("Ошибка загрузки AI-анализа магазинов");
  }
  return res.json();
}

export function useStoreAIInsights(params: {
  period?: number;
  enabled?: boolean;
}) {
  return useQuery<StoreAIResponse>({
    queryKey: ["store-ai-insights", params.period],
    queryFn: () => fetchStoreAIInsights(params),
    staleTime: 10 * 60 * 1000,
    enabled: params.enabled !== false,
  });
}
