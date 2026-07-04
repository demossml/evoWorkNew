import { useMemo } from "react";

export type PaymentData = {
  sell: Record<string, number>;
  refund: Record<string, number>;
  totalSell: number;
};

export type ReportData = {
  salesDataByShopName: Record<string, PaymentData>;
  grandTotalSell: number;
  grandTotalRefund: number;
  grandTotalCashOutcome: number;
  startDate: string;
  endDate: string;
  cashOutcomeData: Record<string, Record<string, number>>;
  cashBalanceByShop: Record<string, number>;
};

export type ShopAnalytics = {
  shopName: string;
  totalSell: number;
  refunds: number;
  payouts: number;
  netRevenue: number;
  cashBalance: number;
  sell: Record<string, number>;
  refund: Record<string, number>;
  cashOutcome: Record<string, number>;
};

export type SalesSummary = {
  shops: ShopAnalytics[];
  sumSellFromRows: number;
  sumRefundFromRows: number;
  sumPayoutsFromRows: number;
  cashTotal: number;
  netTotal: number;
  hasConsistencyIssue: boolean;
  diffSell: number;
  diffRefund: number;
  diffPayouts: number;
};

export function useSalesSummaryReport(
  reportData: ReportData | null
): SalesSummary | null {
  return useMemo(() => {
    if (!reportData) return null;

    const allShopNames = Array.from(
      new Set([
        ...Object.keys(reportData.salesDataByShopName || {}),
        ...Object.keys(reportData.cashBalanceByShop || {}),
        ...Object.keys(reportData.cashOutcomeData || {}),
      ])
    );

    const shops: ShopAnalytics[] = allShopNames.map((shopName) => {
      const data = reportData.salesDataByShopName[shopName] || {
        sell: {},
        refund: {},
        totalSell: 0,
      };
      const refunds = Object.values(data.refund).reduce((sum, v) => sum + v, 0);
      const payouts = Object.values(
        reportData.cashOutcomeData[shopName] || {}
      ).reduce((sum, v) => sum + v, 0);
      const cashBalance = reportData.cashBalanceByShop[shopName] || 0;
      return {
        shopName,
        totalSell: data.totalSell || 0,
        refunds,
        payouts,
        netRevenue: (data.totalSell || 0) - refunds - payouts,
        cashBalance,
        sell: data.sell,
        refund: data.refund,
        cashOutcome: reportData.cashOutcomeData[shopName] || {},
      };
    });

    shops.sort((a, b) => b.totalSell - a.totalSell);

    const sumSellFromRows = shops.reduce((sum, row) => sum + row.totalSell, 0);
    const sumRefundFromRows = shops.reduce((sum, row) => sum + row.refunds, 0);
    const sumPayoutsFromRows = shops.reduce(
      (sum, row) => sum + row.payouts,
      0
    );
    const cashTotal = Object.values(reportData.cashBalanceByShop || {}).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    );
    const netTotal = shops.reduce((sum, row) => sum + row.netRevenue, 0);

    const diffSell = Math.abs(
      sumSellFromRows - (reportData.grandTotalSell || 0)
    );
    const diffRefund = Math.abs(
      sumRefundFromRows - (reportData.grandTotalRefund || 0)
    );
    const diffPayouts = Math.abs(
      sumPayoutsFromRows - (reportData.grandTotalCashOutcome || 0)
    );

    const hasConsistencyIssue =
      diffSell > 1 || diffRefund > 1 || diffPayouts > 1;

    return {
      shops,
      sumSellFromRows,
      sumRefundFromRows,
      sumPayoutsFromRows,
      cashTotal,
      netTotal,
      hasConsistencyIssue,
      diffSell,
      diffRefund,
      diffPayouts,
    };
  }, [reportData]);
}
