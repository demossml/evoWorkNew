/**
 * useWeekdayCompare — fetches multi-week comparison data for same-weekday analysis.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchWeekdayCompare } from "@shared/api";
import type { WeekdayCompareProfile } from "@/widgets/sellers/SellerDNAWidget/types";

export function useWeekdayCompare(targetDate: string, weeksBack: number = 4) {
  return useQuery<{ weekday: number; dates: string[]; sellers: WeekdayCompareProfile[] }>({
    queryKey: ["sellers", "weekday-compare", targetDate, weeksBack],
    queryFn: () => fetchWeekdayCompare({ targetDate, weeksBack }),
    staleTime: 120_000,
    enabled: !!targetDate,
  });
}
