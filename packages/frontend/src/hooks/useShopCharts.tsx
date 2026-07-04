import { useQuery } from "@tanstack/react-query";
import { fetchSalesTodayGraph } from "@shared/api";

type ChartPoint = { time: string; value: number };
type ShopChartData = { shopName: string; data: ChartPoint[] };

type ChartData = {
  [shopName: string]: {
    nowDataSales: ShopChartData;
    sevenDaysDataSales: ShopChartData;
  };
};

export const useShopCharts = (openedShop: string | null) => {
  return useQuery<ChartData, Error>({
    queryKey: ["shopCharts", openedShop],
    queryFn: async () => {
      if (!openedShop) throw new Error("openedShop is null");
      const data = await fetchSalesTodayGraph();

      return {
        [openedShop]: {
          nowDataSales: data.nowDataSales.find(
            (i: ShopChartData) => i.shopName === openedShop
          ) || {
            shopName: openedShop,
            data: [],
          },
          sevenDaysDataSales: data.sevenDaysDataSales.find(
            (i: ShopChartData) => i.shopName === openedShop
          ) || {
            shopName: openedShop,
            data: [],
          },
        },
      };
    },
    enabled: Boolean(openedShop),
    staleTime: 5 * 60 * 1000, // кешировать 5 минут
    refetchOnWindowFocus: false,
    refetchInterval: 60000, // обновлять каждую минуту (опционально)
    refetchIntervalInBackground: false,
  });
};
