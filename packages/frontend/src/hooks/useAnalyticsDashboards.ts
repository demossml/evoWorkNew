import { useQuery } from "@tanstack/react-query";
import {
  fetchAnalyticsShops,
  fetchBusinessDashboard,
  fetchProductDashboard,
  fetchReliabilityDashboard,
} from "@features/analytics/api";

type ShopFilter = {
  shopName?: string;
  shopUuid?: string;
};

export function useAnalyticsShops() {
  return useQuery({
    queryKey: ["analytics", "shops"],
    queryFn: fetchAnalyticsShops,
    staleTime: 5 * 60_000,
  });
}

export function useProductDashboard() {
  return useQuery({
    queryKey: ["analytics", "product"],
    queryFn: fetchProductDashboard,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useReliabilityDashboard() {
  return useQuery({
    queryKey: ["analytics", "reliability"],
    queryFn: fetchReliabilityDashboard,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useBusinessDashboard(filter?: ShopFilter) {
  return useQuery({
    queryKey: ["analytics", "business", filter?.shopUuid || "", filter?.shopName || ""],
    queryFn: () => fetchBusinessDashboard(filter),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
