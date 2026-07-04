import { useQuery } from "@tanstack/react-query";
import type { SalesData } from "../../widgets/dashboard/type";
import { fetchFinancialMetrics } from "@shared/api";

interface UseSalesDataParams {
  since?: string;
  until?: string;
  shopUuid?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}

interface UseSalesDataReturn {
  data: SalesData | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  isUpdating: boolean;
}

/**
 * Хук для получения финансовых данных.
 *
 * Логика:
 * - Если переданы since и until → GET /financial?since&until
 * - Если нет → GET /financial/today
 * - Автообновление раз в 180 секунд
 */
export function useSalesData(params?: UseSalesDataParams): UseSalesDataReturn {
  const pollIntervalMs = params?.pollIntervalMs ?? 180_000;
  const query = useQuery<SalesData, Error>({
    queryKey: [
      "salesData",
      params?.since || "",
      params?.until || "",
      params?.shopUuid || "",
    ],
    queryFn: async () =>
      (await fetchFinancialMetrics({
        since: params?.since,
        until: params?.until,
        shopUuid: params?.shopUuid,
      })) as SalesData,
    enabled: params?.enabled !== false,
    staleTime: 30_000,
    refetchInterval: pollIntervalMs > 0 ? pollIntervalMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  return {
    data: query.data || null,
    loading: query.isLoading,
    error: query.error?.message || null,
    lastUpdate: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    isUpdating: query.isFetching && !query.isLoading,
  };
}
