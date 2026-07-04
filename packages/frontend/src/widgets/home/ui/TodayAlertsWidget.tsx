import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { fetchFinancialForToday, queryKeys } from "@shared/api";
import {
  buildTodayAlerts,
  getAlertStyle,
  normalizeFinancialSalesData,
  type TodayAlertModel,
} from "@features/dashboard/model/todayAlertsModel";

interface Alert {
  type: "warning" | "danger" | "info";
  title: string;
  message: string;
  icon: React.ReactNode;
}

function mapAlertIcon(iconKey: TodayAlertModel["iconKey"]) {
  switch (iconKey) {
    case "trending_down":
      return <TrendingDown className="w-5 h-5" />;
    case "alert_triangle":
      return <AlertTriangle className="w-5 h-5" />;
    case "clock":
      return <Clock className="w-5 h-5" />;
    default:
      return <AlertTriangle className="w-5 h-5" />;
  }
}

export function TodayAlertsWidget() {
  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: queryKeys.alerts.todayFinancial(),
    queryFn: async () => {
      const data = await fetchFinancialForToday();
      const normalizedSalesDataByShopName = normalizeFinancialSalesData(
        data.salesDataByShopName as Record<
          string,
          { sell?: Record<string, unknown>; refund?: Record<string, unknown> }
        >
      );

      const alertModels = buildTodayAlerts(
        {
          salesDataByShopName: normalizedSalesDataByShopName,
          grandTotalSell: data.grandTotalSell,
        },
        new Date()
      );

      return alertModels.map((item) => ({
        type: item.type,
        title: item.title,
        message: item.message,
        icon: mapAlertIcon(item.iconKey),
      }));
    },
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-3 animate-pulse" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Оповещения
      </h2>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={`${alert.type}-${alert.title}`}
            className={`flex items-start gap-3 p-3 rounded-lg border ${getAlertStyle(alert.type)}`}
          >
            <div className="mt-0.5">{alert.icon}</div>
            <div className="flex-1">
              <div className="font-semibold text-sm">{alert.title}</div>
              <div className="text-xs opacity-90 mt-0.5">{alert.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
