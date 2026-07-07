/**
 * useWeekdayBreakdown — fetches per-weekday stats for a single seller.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchWeekdayBreakdown } from "@shared/api";

export function useWeekdayBreakdown(sellerId: string, since: string, until: string) {
  return useQuery<Record<number, { days: number; totalRevenue: number; totalChecks: number; avgCheck: number; rubPerHour: number | null }>>({
    queryKey: ["sellers", "weekday-breakdown", sellerId, since, until],
    queryFn: () => fetchWeekdayBreakdown({ sellerId, since, until }),
    staleTime: 120_000,
    enabled: !!sellerId && !!since && !!until,
  });
}
