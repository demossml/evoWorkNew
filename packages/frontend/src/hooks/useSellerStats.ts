/**
 * useSellerStats — TanStack Query wrapper for /api/sellers/advanced-stats.
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys, fetchSellerAdvancedStats } from "@shared/api";
import type { SellerDNAProfile } from "@/widgets/sellers/SellerDNAWidget/types";
import { MOCK_SELLERS } from "./mockSellers";
import type { DateFilterValue } from "@/widgets/home/DateFilter";

export interface SellerStatsParams {
  dateFilter: DateFilterValue;
  benchmarkWeekday?: number;  // 0=Sun..6=Sat, for 4-week same-weekday benchmark
  weekday?: number;            // filter sessions to this weekday only
}

export function useSellerStats(params: SellerStatsParams) {
  const { dateFilter, benchmarkWeekday, weekday } = params;

  return useQuery<SellerDNAProfile[]>({
    queryKey: queryKeys.sellers.advancedStats(
      dateFilter.since,
      dateFilter.until,
      benchmarkWeekday,
      weekday,
    ),
    queryFn: async () => {
      const data = await fetchSellerAdvancedStats({
        since: dateFilter.since,
        until: dateFilter.until,
        benchmarkWeekday,
        weekday,
      });
      if (!data || data.length === 0) {
        return MOCK_SELLERS;
      }
      return data;
    },
    placeholderData: (prev) => prev ?? MOCK_SELLERS,
    staleTime: 60_000,
  });
}
