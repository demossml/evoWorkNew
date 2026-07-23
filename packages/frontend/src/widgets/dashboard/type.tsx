export interface ShopSalesData {
  sell: Record<string, number>;
  refund: Record<string, number>;
  totalSell: number;
  checksCount: number;
}

export interface ProductData {
  productName: string;
  revenue: number;
  quantity: number;
  refundRevenue: number;
  refundQuantity: number;
  netRevenue: number;
  netQuantity: number;
  grossProfit: number;
  marginPct: number;
  averagePrice: number;
  refundRate: number;
  dailyNetRevenue7: number[];
}

export interface SalesData {
  salesDataByShopName: Record<string, ShopSalesData>;
  grandTotalSell: number;
  grandTotalRefund: number;
  netRevenue: number;
  averageCheck: number;
  grandTotalCashOutcome: number;
  cashOutcomeData: Record<string, Record<string, number>>;
  cashBalanceByShop: Record<string, number>;
  totalCashBalance: number;
  totalChecks: number;
  topProducts: ProductData[];
  /** Продажи по товарным группам: vape / accessory / other */
  salesByGroup?: { vape: number; accessory: number; other: number };
  /** YYYY-MM-DD → выручка за день, по всем магазинам. Только для периодных
   * запросов (since+until) — сервер строит его из тех же документов, что и
   * grandTotalSell, просто не схлопывает их в одно число. */
  dailySell?: Record<string, number>;
}
