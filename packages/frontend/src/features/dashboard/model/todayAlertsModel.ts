type NormalizedShopSales = { sell: number; refund: number };

export type TodayAlertModel = {
  type: "warning" | "danger" | "info";
  title: string;
  message: string;
  iconKey: "trending_down" | "alert_triangle" | "clock";
};

export type TodayAlertsData = {
  salesDataByShopName: Record<string, NormalizedShopSales>;
  grandTotalSell: number;
};

export function normalizeFinancialSalesData(
  salesDataByShopName: Record<
    string,
    { sell?: Record<string, unknown>; refund?: Record<string, unknown> }
  >
): Record<string, NormalizedShopSales> {
  const normalized: Record<string, NormalizedShopSales> = {};

  for (const [shop, shopData] of Object.entries(salesDataByShopName)) {
    normalized[shop] = {
      sell: shopData?.sell
        ? (Object.values(shopData.sell) as number[]).reduce((a, b) => a + b, 0)
        : 0,
      refund: shopData?.refund
        ? (Object.values(shopData.refund) as number[]).reduce(
            (a, b) => a + b,
            0
          )
        : 0,
    };
  }

  return normalized;
}

export function buildTodayAlerts(
  data: TodayAlertsData,
  now: Date
): TodayAlertModel[] {
  const alerts: TodayAlertModel[] = [];
  const shopCount = Object.keys(data.salesDataByShopName).length;
  if (shopCount === 0) return alerts;

  const avgSales = data.grandTotalSell / shopCount;

  const lowSalesShops = Object.entries(data.salesDataByShopName).filter(
    ([, shopData]) => shopData.sell < avgSales * 0.5 && shopData.sell > 0
  );
  if (lowSalesShops.length > 0) {
    alerts.push({
      type: "warning",
      title: "Низкие продажи",
      message: `${lowSalesShops.length} магазин(ов) с продажами ниже 50% среднего`,
      iconKey: "trending_down",
    });
  }

  const highRefundShops = Object.entries(data.salesDataByShopName).filter(
    ([, shopData]) =>
      shopData.refund > 0 &&
      shopData.sell > 0 &&
      shopData.refund / shopData.sell > 0.1
  );
  if (highRefundShops.length > 0) {
    alerts.push({
      type: "danger",
      title: "Высокие возвраты",
      message: `${highRefundShops.length} магазин(ов) с возвратами >10%`,
      iconKey: "alert_triangle",
    });
  }

  const currentHour = now.getHours();
  const noSalesShops = Object.entries(data.salesDataByShopName).filter(
    ([, shopData]) => shopData.sell === 0
  );
  if (currentHour >= 12 && noSalesShops.length > 0) {
    alerts.push({
      type: "info",
      title: "Нет продаж",
      message: `${noSalesShops.length} магазин(ов) без продаж после 12:00`,
      iconKey: "clock",
    });
  }

  return alerts;
}

export function getAlertStyle(type: TodayAlertModel["type"]) {
  switch (type) {
    case "danger":
      return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200";
    case "warning":
      return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200";
    case "info":
      return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200";
    default:
      return "bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200";
  }
}
