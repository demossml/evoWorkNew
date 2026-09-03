import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@shared/api";
import { useSalesData } from "./useSalesData";
import { useGrossProfit } from "./useGrossProfit";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Единый сигнал загрузки плиток Home.
 * Подписывается на те же query-ключи, что и виджеты (react-query дедуплицирует
 * запросы), поэтому «Обновить» / смена даты меняют все плитки одним кадром.
 */
export function useHomeDashboard(since: string, until: string, isUniversal: boolean) {
  const sales = useSalesData({ since, until });
  const grossProfit = useGrossProfit({ since, until });
  const today = localToday();

  const highMargin = useQuery({
    queryKey: ["high-margin", since, until, "all"],
    queryFn: async () => {
      const qs = new URLSearchParams({ since, until, scope: "all" });
      const res = await fetch(`/api/evotor/high-margin-products?${qs}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const tempo = useQuery({
    queryKey: isUniversal ? ["day-compare", today] : ["hourly-plan-fact", since],
    queryFn: async () => {
      const url = isUniversal
        ? `/api/analytics/revenue/day-compare?date=${today}`
        : `/api/analytics/revenue/hourly-plan-fact?date=${since}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  return {
    isLoading:
      sales.loading || grossProfit.isLoading || highMargin.isLoading || tempo.isLoading,
    isFetching:
      sales.isUpdating || grossProfit.isFetching || highMargin.isFetching || tempo.isFetching,
  };
}
