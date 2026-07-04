// hooks/dashboard/useSalesCalculations.ts

import type { SalesData } from "../../widgets/dashboard/type";
import { computeRevenueSummary } from "@/shared/api/contracts/revenueMath";

export function useSalesCalculations(data: SalesData | null) {
  if (!data) {
    return {
      netSales: 0,
      averageCheck: 0,
      bestShop: null,
    };
  }

  const sell = data.grandTotalSell ?? 0;
  const refund = data.grandTotalRefund ?? 0;
  const checks = data.totalChecks ?? 0;

  const { netRevenue: netSales, averageCheck } = computeRevenueSummary(
    sell,
    refund,
    checks
  );

  const shops = data.salesDataByShopName || {};
  const bestShop = Object.entries(shops).reduce(
    (best, [name, shop]) =>
      !best || (shop?.totalSell ?? 0) > best.sales
        ? { name, sales: shop?.totalSell ?? 0 }
        : best,
    null as { name: string; sales: number } | null
  );

  return { netSales, averageCheck, bestShop };
}
