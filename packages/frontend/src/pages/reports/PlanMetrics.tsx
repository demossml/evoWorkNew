import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  Store,
  Clock,
  Calendar,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import { useGetReportAndPlan } from "../../hooks/useReportData";
import { useGetShopNames } from "../../hooks/useGetShopNames";
import { ErrorState, LoadingState } from "@shared/ui/states";

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

export default function PlanMetrics() {
  const {
    data: shopNames = [],
    isLoading: shopsLoading,
    error: shopsError,
  } = useGetShopNames();
  const {
    data,
    isLoading: loading,
    error,
  } = useGetReportAndPlan(shopNames.length > 0);

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
      ([shopName, shopData]) => {
        const planRaw = planData[shopName];
        const plan =
          typeof planRaw === "number"
            ? planRaw
            : planRaw && typeof planRaw === "object"
              ? planRaw.datePlan || 0
              : 0;
        const totalRefund = Object.values(shopData.refund || {}).reduce(
          (sum, val) => sum + val,
          0
        );
        const actual = (shopData.totalSell || 0) - totalRefund;
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
    return <LoadingState />;
  }

  if (shopsError || error) {
    return (
      <ErrorState
        error={
          shopsError?.message || error?.message || "Ошибка загрузки данных"
        }
      />
    );
  }

  return (
    <div className="app-page bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 py-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto"
      >
        {/* Заголовок */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
            <Target className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            Метрики по плану
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Общая статистика */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Общий план */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Общий план
                </p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                  {formatAmount(totalMetrics.totalPlan)} ₽
                </p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </motion.div>

          {/* Фактическая выручка */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Фактическая выручка
                </p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                  {formatAmount(totalMetrics.totalActual)} ₽
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </motion.div>

          {/* Процент выполнения */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Выполнение плана
                </p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                  {totalMetrics.totalProgress.toFixed(1)}%
                </p>
              </div>
              <div
                className={`p-3 rounded-lg ${
                  totalMetrics.totalProgress >= 100
                    ? "bg-green-100 dark:bg-green-900"
                    : totalMetrics.totalProgress >= 90
                      ? "bg-yellow-100 dark:bg-yellow-900"
                      : "bg-red-100 dark:bg-red-900"
                }`}
              >
                {totalMetrics.totalProgress >= 100 ? (
                  <TrendingUp
                    className={`w-6 h-6 ${
                      totalMetrics.totalProgress >= 100
                        ? "text-green-600 dark:text-green-400"
                        : "text-yellow-600 dark:text-yellow-400"
                    }`}
                  />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-600 dark:text-red-400" />
                )}
              </div>
            </div>
          </motion.div>

          {/* Статус магазинов */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Магазины
                </p>
                <div className="flex gap-2 text-sm mt-2">
                  <span className="text-green-600 dark:text-green-400 font-bold">
                    ✓ {totalMetrics.shopsOnTarget}
                  </span>
                  <span className="text-yellow-600 dark:text-yellow-400 font-bold">
                    ⚠ {totalMetrics.shopsWarning}
                  </span>
                  <span className="text-red-600 dark:text-red-400 font-bold">
                    ✕ {totalMetrics.shopsAtRisk}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Store className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Список магазинов */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6"
        >
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Детализация по магазинам
          </h2>

          <div className="space-y-4">
            {metrics.map((metric, index) => (
              <motion.div
                key={metric.shopName}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.05 }}
                className={`border-l-4 rounded-lg p-4 ${
                  metric.status === "success"
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                    : metric.status === "warning"
                      ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                      : "border-red-500 bg-red-50 dark:bg-red-900/20"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Store className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="font-bold text-gray-800 dark:text-white">
                      {metric.shopName}
                    </h3>
                    {metric.status === "danger" && (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-lg font-bold ${
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
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      План
                    </p>
                    <p className="text-sm font-bold text-gray-800 dark:text-white">
                      {formatAmount(metric.plan)} ₽
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Факт
                    </p>
                    <p className="text-sm font-bold text-gray-800 dark:text-white">
                      {formatAmount(metric.actual)} ₽
                    </p>
                  </div>
                </div>

                {/* Прогресс бар */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      metric.status === "success"
                        ? "bg-green-500"
                        : metric.status === "warning"
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(metric.progress, 100)}%` }}
                  />
                </div>

                {/* Разница */}
                <div className="flex items-center gap-2 text-sm">
                  {metric.difference >= 0 ? (
                    <>
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        +{formatAmount(metric.difference)} ₽
                      </span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-4 h-4 text-red-500" />
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {formatAmount(metric.difference)} ₽
                      </span>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Время обновления */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            Обновлено:{" "}
            {new Date().toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
