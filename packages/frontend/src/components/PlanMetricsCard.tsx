import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Store,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import { useGetReportAndPlan } from "../hooks/useReportData";
import { useGetShopNames } from "../hooks/useGetShopNames";

// Форматирование суммы
const formatAmount = (amount: number): string => {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Расчет процента выполнения плана
const calculatePlanProgress = (actual: number, plan: number): number => {
  if (plan === 0) return 0;
  return (actual / plan) * 100;
};

interface ShopMetrics {
  shopName: string;
  plan: number;
  actual: number;
  progress: number;
  difference: number;
  status: "success" | "warning" | "danger";
}

export default function PlanMetricsCard() {
  const { data: shopNames = [], isLoading: shopsLoading } = useGetShopNames();
  const { data, isLoading: loading } = useGetReportAndPlan(
    shopNames.length > 0
  );

  const [metrics, setMetrics] = useState<ShopMetrics[]>([]);
  const [totalMetrics, setTotalMetrics] = useState({
    totalPlan: 0,
    totalActual: 0,
    totalProgress: 0,
    shopsOnTarget: 0,
    shopsWarning: 0,
    shopsAtRisk: 0,
  });

  useEffect(() => {
    if (!data?.reportData?.salesDataByShopName || !data?.planData) return;

    const salesData = data.reportData.salesDataByShopName;
    const planData = data.planData;

    const calculatedMetrics: ShopMetrics[] = Object.entries(salesData).map(
      ([shopName]) => {
        const planInfo = planData[shopName];
        const plan = planInfo?.datePlan || 0;
        const actual = planInfo?.dataSales || 0;
        const progress = calculatePlanProgress(actual, plan);
        const difference = actual - plan;

        let status: "success" | "warning" | "danger" = "success";
        if (progress < 70) status = "danger";
        else if (progress < 90) status = "warning";

        return {
          shopName,
          plan,
          actual,
          progress,
          difference,
          status,
        };
      }
    );

    // Сортировка по проценту выполнения (худшие первыми)
    calculatedMetrics.sort((a, b) => a.progress - b.progress);

    const totalPlan = calculatedMetrics.reduce((sum, m) => sum + m.plan, 0);
    const totalActual = calculatedMetrics.reduce((sum, m) => sum + m.actual, 0);
    const totalProgress = calculatePlanProgress(totalActual, totalPlan);

    setMetrics(calculatedMetrics);
    setTotalMetrics({
      totalPlan,
      totalActual,
      totalProgress,
      shopsOnTarget: calculatedMetrics.filter((m) => m.status === "success")
        .length,
      shopsWarning: calculatedMetrics.filter((m) => m.status === "warning")
        .length,
      shopsAtRisk: calculatedMetrics.filter((m) => m.status === "danger")
        .length,
    });
  }, [data]);

  if (shopsLoading || loading) {
    return (
      <div className="w-full mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <div className="space-y-4">
            <div className="w-full h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="w-2/3 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="w-4/5 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full mb-8"
    >
      {/* Заголовок и общая статистика */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl shadow-lg p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Метрики по плану</h2>
              <p className="text-sm text-white/80">
                {new Date().toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Общая статистика */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Общий план */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-white/80" />
              <p className="text-xs text-white/80">План</p>
            </div>
            <p className="text-lg font-bold text-white">
              {formatAmount(totalMetrics.totalPlan)} ₽
            </p>
          </div>

          {/* Фактическая выручка */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-white/80" />
              <p className="text-xs text-white/80">Факт</p>
            </div>
            <p className="text-lg font-bold text-white">
              {formatAmount(totalMetrics.totalActual)} ₽
            </p>
          </div>

          {/* Процент выполнения */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              {totalMetrics.totalProgress >= 100 ? (
                <TrendingUp className="w-4 h-4 text-white/80" />
              ) : (
                <TrendingDown className="w-4 h-4 text-white/80" />
              )}
              <p className="text-xs text-white/80">Выполнение</p>
            </div>
            <p className="text-lg font-bold text-white">
              {totalMetrics.totalProgress.toFixed(1)}%
            </p>
          </div>

          {/* Статус магазинов */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Store className="w-4 h-4 text-white/80" />
              <p className="text-xs text-white/80">Магазины</p>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-green-300 font-bold">
                ✓ {totalMetrics.shopsOnTarget}
              </span>
              <span className="text-yellow-300 font-bold">
                ⚠ {totalMetrics.shopsWarning}
              </span>
              <span className="text-red-300 font-bold">
                ✕ {totalMetrics.shopsAtRisk}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Детализация по магазинам - компактная версия */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
          Детализация по магазинам
        </h3>

        <div className="space-y-3">
          {metrics.slice(0, 5).map((metric, index) => (
            <motion.div
              key={metric.shopName}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`border-l-4 rounded-lg p-3 ${
                metric.status === "success"
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : metric.status === "warning"
                    ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                    : "border-red-500 bg-red-50 dark:bg-red-900/20"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <h4 className="font-bold text-sm text-gray-800 dark:text-white">
                    {metric.shopName}
                  </h4>
                  {metric.status === "danger" && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <span
                  className={`text-sm font-bold ${
                    metric.status === "success"
                      ? "text-green-600 dark:text-green-400"
                      : metric.status === "warning"
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {metric.progress.toFixed(1)}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    План
                  </p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white">
                    {formatAmount(metric.plan)} ₽
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Факт
                  </p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white">
                    {formatAmount(metric.actual)} ₽
                  </p>
                </div>
              </div>

              {/* Прогресс бар */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    metric.status === "success"
                      ? "bg-green-500"
                      : metric.status === "warning"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(metric.progress, 100)}%` }}
                />
              </div>
            </motion.div>
          ))}

          {metrics.length > 5 && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 pt-2">
              Показаны {5} из {metrics.length} магазинов
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
