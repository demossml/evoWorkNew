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
}
