import { useMemo } from "react";
import type { SalesData } from "../../widgets/dashboard/type";
import { computeRevenueSummary } from "@/shared/api/contracts/revenueMath";

export function useFilteredSalesData(
  data: SalesData | null,
  isSuperAdmin: boolean,
  currentWorkShop: { name?: string; isWorkingToday?: boolean } | null
) {
  return useMemo<SalesData | null>(() => {
    if (!data || isSuperAdmin) return data;

    const shopName = currentWorkShop?.name;
    // Для обычного пользователя без определенного магазина не показываем
    // сводные данные по всей сети, чтобы не завышать выручку.
    if (!shopName || currentWorkShop?.isWorkingToday === false) return null;

    const shopData = data.salesDataByShopName[shopName];
    if (!shopData) return null;

    const grandTotalRefund = Object.values(shopData.refund).reduce(
      (a, b) => a + b,
      0
    );
    const totalChecks = shopData.checksCount;
    const { netRevenue, averageCheck } = computeRevenueSummary(
      shopData.totalSell,
      grandTotalRefund,
      totalChecks
    );

    return {
      salesDataByShopName: { [shopName]: shopData },
      grandTotalSell: shopData.totalSell,
      grandTotalRefund,
      netRevenue,
      averageCheck,
      grandTotalCashOutcome: Object.values(
        data.cashOutcomeData[shopName] || {}
      ).reduce((a, b) => a + b, 0),
      cashOutcomeData: {
        [shopName]: data.cashOutcomeData[shopName] || {},
      },
      cashBalanceByShop: {
        [shopName]: Number(data.cashBalanceByShop?.[shopName] || 0),
      },
      totalCashBalance: Number(data.cashBalanceByShop?.[shopName] || 0),
      totalChecks,
      topProducts: data.topProducts ?? [],
      salesByGroup: data.salesByGroup,
    };
  }, [data, isSuperAdmin, currentWorkShop]);
}
