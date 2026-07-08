/**
 * useHourlyCompare — TanStack Query wrapper for /api/sellers/hourly-compare.
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys, fetchHourlyCompare } from "@shared/api";
import type { HourlyCompareResult } from "@/widgets/sellers/SellerDNAWidget/types";

export function useHourlyCompare(params: {
  targetDate: string;
  weeksBack?: number;
  shopId?: string;
  sellerIds: string[];
  granularityMinutes?: number;
}) {
  const { targetDate, weeksBack = 5, shopId, sellerIds, granularityMinutes = 60 } = params;

  return useQuery<HourlyCompareResult>({
    queryKey: queryKeys.sellers.hourlyCompare(targetDate, weeksBack, sellerIds, granularityMinutes),
    queryFn: () =>
      fetchHourlyCompare({ targetDate, weeksBack, shopId, sellerIds, granularityMinutes }),
    enabled: sellerIds.length >= 2,
    staleTime: 120_000,
  });
}
