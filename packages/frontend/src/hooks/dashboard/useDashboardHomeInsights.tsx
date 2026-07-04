import { useEffect, useState } from "react";
import { fetchDashboardHomeInsights } from "@features/dashboard/api";
import type { DashboardSummaryAiInsights } from "../../widgets/dashboard/DashboardSummaryAiSection";
import type { ShopKpiRow } from "../../widgets/dashboard/cards/BestShopDetails";
import type { ShopLeaderCardData } from "../../widgets/dashboard/cards/BestShopCard";

type Params = {
  since: string;
  until: string;
  dateMode: "today" | "yesterday" | "period";
  shopUuid?: string;
  enabled?: boolean;
};

const EMPTY_INSIGHTS: DashboardSummaryAiInsights = {
  risk: { networkProbability: 0, redShops: [] },
  actions: { top3: [], checklist: [] },
  forecast: { value: 0, lower: 0, upper: 0, confidence: 0, factors: [] },
  drop: { salesDeltaPct: 0, mainReason: "Недостаточно данных", byShop: [] },
  anomalies: { incidents: [] },
  losses: { totalLoss: 0, skus: [] },
  context: { checksDeltaPct: 0, avgCheckDeltaPct: 0, refundRate: 0, refundDeltaPp: 0 },
};

export function useDashboardHomeInsights(params: Params) {
  const [data, setData] = useState<DashboardSummaryAiInsights>(EMPTY_INSIGHTS);
  const [bestShop, setBestShop] = useState<{
    dayRows: ShopKpiRow[];
    weekRows: ShopKpiRow[];
    dayLeader: ShopLeaderCardData | null;
    weekLeader: ShopLeaderCardData | null;
  }>({
    dayRows: [],
    weekRows: [],
    dayLeader: null,
    weekLeader: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.enabled === false) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const json = await fetchDashboardHomeInsights({
            since: params.since,
            until: params.until,
            dateMode: params.dateMode,
            ...(params.shopUuid ? { shopUuid: params.shopUuid } : {}),
        });
        if (!cancelled) {
          const typed = json as {
            insights?: DashboardSummaryAiInsights;
            bestShop?: {
              dayRows?: ShopKpiRow[];
              weekRows?: ShopKpiRow[];
              dayLeader?: ShopLeaderCardData | null;
              weekLeader?: ShopLeaderCardData | null;
            };
          };
          setData(typed.insights || EMPTY_INSIGHTS);
          setBestShop({
            dayRows: typed.bestShop?.dayRows || [],
            weekRows: typed.bestShop?.weekRows || [],
            dayLeader: typed.bestShop?.dayLeader || null,
            weekLeader: typed.bestShop?.weekLeader || null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки инсайтов");
          setData(EMPTY_INSIGHTS);
          setBestShop({
            dayRows: [],
            weekRows: [],
            dayLeader: null,
            weekLeader: null,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [params.since, params.until, params.dateMode, params.shopUuid, params.enabled]);

  return { data, bestShop, loading, error };
}
