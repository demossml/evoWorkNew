/**
 * useWeekdayCompare — fetches multi-week comparison data for same-weekday analysis.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchWeekdayCompare } from "@shared/api";
import type { WeekdayCompareProfile } from "@/widgets/sellers/SellerDNAWidget/types";

export interface WeekdayCompareParams {
  targetDate: string;
  weeksBack?: number;
  shopId?: string;
  compareMode?: "same-day" | "same-weekday";
  sellerIds?: string[];
}

export function useWeekdayCompare(params: WeekdayCompareParams) {
  const { targetDate, weeksBack = 4, shopId, compareMode, sellerIds } = params;

  return useQuery<{
    weekday: number;
    dates: string[];
    sellers: WeekdayCompareProfile[];
    recommendation?: { message: string; bestWeekday?: number; bestWeekdayLabel?: string; bestCount?: number };
  }>({
    queryKey: ["sellers", "weekday-compare", targetDate, weeksBack, shopId, compareMode, sellerIds],
    queryFn: () => fetchWeekdayCompare({ targetDate, weeksBack, shopId, compareMode, sellerIds }),
    staleTime: 120_000,
    enabled: !!targetDate && (compareMode !== "same-day" || (sellerIds && sellerIds.length >= 2)),
  });
}
