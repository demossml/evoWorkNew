import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Store,
  DollarSign,
  ShoppingCart,
  Award,
  Clock,
  RotateCcw,
  Trophy,
  Medal,
  Package,
  AlertTriangle,
  BarChart3,
  Tags,
  Percent,
} from "lucide-react";
import { useEmployeeRole } from "../hooks/useApi";
import { useCurrentWorkShop } from "../hooks/useCurrentWorkShop";
import { fetchFinancialTodayForUser } from "@shared/api";

interface ProductData {
  productName: string;
  revenue: number;
  quantity: number;
  refundRevenue: number;
  refundQuantity: number;
  netRevenue: number;
  netQuantity: number;
  averagePrice: number;
  refundRate: number;
}

interface SalesData {
  salesDataByShopName: Record<
    string,
    {
      sell: Record<string, number>;
      refund: Record<string, number>;
      totalSell: number;
      checksCount: number;
    }
  >;
  grandTotalSell: number;
  grandTotalRefund: number;
  grandTotalCashOutcome: number;
  cashOutcomeData: Record<string, Record<string, number>>;
  totalChecks: number;
  topProducts: ProductData[];
}

export default function DashboardSummary() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Получаем роль пользователя и магазин
  const { data: roleData } = useEmployeeRole();
  const { data: currentWorkShop } = useCurrentWorkShop();
  // console.log("Current WorkShop:", currentWorkShop);

  const isSuperAdmin = roleData?.employeeRole === "SUPERADMIN";

  // Фильтруем данные по текущему магазину для обычных пользователей
  const filteredData = useMemo(() => {
    if (!data || isSuperAdmin) return data;

    // Если пользователь не работает сегодня, не показываем данные
    if (!currentWorkShop?.isWorkingToday) return null;

    if (!currentWorkShop?.name) return data;

    // Для обычных пользователей показываем только данные их магазина
    const shopName = currentWorkShop.name;
    const shopData = data.salesDataByShopName[shopName];

    if (!shopData) return null;

    // Фильтруем топ-продукты (если они есть в API)
    return {
      salesDataByShopName: { [shopName]: shopData },
      grandTotalSell: shopData.totalSell,
      grandTotalRefund: Object.values(shopData.refund).reduce(
        (sum, val) => sum + val,
        0
      ),
      grandTotalCashOutcome: data.cashOutcomeData[shopName]
        ? Object.values(data.cashOutcomeData[shopName]).reduce(
            (sum, val) => sum + val,
            0
          )
        : 0,
      cashOutcomeData: data.cashOutcomeData[shopName]
        ? { [shopName]: data.cashOutcomeData[shopName] }
        : {},
      totalChecks: shopData.checksCount,
      topProducts: data.topProducts || [],
    };
  }, [data, isSuperAdmin, currentWorkShop]);

  useEffect(() => {
    const fetchData = async () => {
      setIsUpdating(true);
      try {
        const result = await fetchFinancialTodayForUser({
          telegramId: localStorage.getItem("telegramId") || "",
          userId: localStorage.getItem("userId") || "",
        });
        if (
          result &&
          !("error" in result) &&
          typeof result === "object" &&
          "salesDataByShopName" in result &&
          "grandTotalSell" in result
        ) {
          setData(result as SalesData);
        } else if (result && "error" in result) {
          console.error("Ошибка в ответе API:", result.error);
        }
        setLastUpdate(new Date());
      } catch (error) {
        console.error("Ошибка загрузки данных:", error);
      } finally {
        setLoading(false);
        setTimeout(() => setIsUpdating(false), 500);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Если пользователь не SuperAdmin и не работает сегодня
  if (
    !loading &&
    !isSuperAdmin &&
    currentWorkShop &&
    !currentWorkShop.isWorkingToday
  ) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center p-8 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-lg max-w-md">
          <Store className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Сегодня у вас выходной
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Данные по продажам доступны только в дни работы
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div
          className={`grid ${isSuperAdmin ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6" : "grid-cols-1 sm:grid-cols-3"} gap-3 mb-6`}
        >
          {(isSuperAdmin ? [1, 2, 3, 4, 5, 6] : [1, 2, 3]).map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow animate-pulse"
            >
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!filteredData) return null;

  const netSales = filteredData.grandTotalSell - filteredData.grandTotalRefund;
  const averageCheck =
    filteredData.totalChecks > 0 ? netSales / filteredData.totalChecks : 0;

  // Вспомогательные функции для подсчета
  const sumValues = (obj: Record<string, number>): number =>
    Object.values(obj).reduce((sum, val) => sum + val, 0);

  const getTotalRefund = (
    shopData: SalesData["salesDataByShopName"][string]
  ): number => sumValues(shopData.refund);

  // Лучший и худший магазины (только для SuperAdmin)
  const shopEntries = Object.entries(filteredData.salesDataByShopName);
  const bestShop = isSuperAdmin
    ? shopEntries.reduce(
        (best, [name, shopData]) =>
          !best || shopData.totalSell > best.sales
            ? { name, sales: shopData.totalSell }
            : best,
        null as { name: string; sales: number } | null
      )
    : null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Компонент анимированного числа
  const AnimatedNumber = ({ value }: { value: number }) => (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {formatCurrency(value)}
    </motion.span>
  );

  return (
    <div>
      {/* Время обновления */}
      {lastUpdate && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Сводка за день
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Обновлено: {formatTime(lastUpdate)}</span>
          </div>
        </div>
      )}

      <div
        className={`grid ${isSuperAdmin ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6" : "grid-cols-1 sm:grid-cols-3 grid-flow-dense"} gap-3 mb-6`}
      >
        {/* Общая выручка */}
        <motion.div
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.98 }}
          animate={isUpdating ? { scale: [1, 1.02, 1] } : {}}
          transition={{ duration: 0.3 }}
          onClick={() =>
            setExpandedCard(expandedCard === "revenue" ? null : "revenue")
          }
          onMouseEnter={() => setHoveredCard("revenue")}
          onMouseLeave={() => setHoveredCard(null)}
          title="Нажмите для просмотра детальной разбивки по магазинам"
          className={`bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white p-4 rounded-xl shadow-lg cursor-pointer relative overflow-hidden transition-all ${
            expandedCard === "revenue" && !isSuperAdmin
              ? "ring-4 ring-blue-300 dark:ring-blue-500"
              : ""
          }`}
        >
          {/* Прогресс бар (условно 70% плана) */}
          <div className="absolute bottom-0 left-0 h-1 bg-white/30 w-full">
            <div className="h-full bg-white/60" style={{ width: "70%" }} />
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium opacity-90">Выручка</span>
            <DollarSign className="w-5 h-5 opacity-80" />
          </div>
          <div className="text-2xl font-bold">
            <AnimatedNumber value={netSales} /> ₽
          </div>
          <div className="text-xs opacity-75 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>70% от плана</span>
          </div>
          {hoveredCard === "revenue" && (
            <div className="absolute top-0 right-0 bg-black/80 text-white text-xs px-2 py-1 rounded-bl-lg">
              {expandedCard === "revenue" ? "Свернуть" : "Развернуть детали"}
            </div>
          )}
        </motion.div>

        {/* Детальный отчет по выручке - для SuperAdmin */}
        {expandedCard === "revenue" && filteredData && isSuperAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="col-span-2 sm:col-span-2 lg:col-span-4 xl:col-span-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Детальная разбивка по магазинам
              </h3>
              <button
                onClick={() => setExpandedCard(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {Object.entries(filteredData.salesDataByShopName)
                .sort(([, a], [, b]) => b.totalSell - a.totalSell)
                .map(([shopName, shopData]) => {
                  const totalSell = shopData.totalSell;
                  const totalRefund = getTotalRefund(shopData);
                  const netShopSales = totalSell - totalRefund;
                  const percentOfTotal =
                    filteredData.grandTotalSell > 0
                      ? (totalSell / filteredData.grandTotalSell) * 100
                      : 0;
                  const refundRate =
                    totalSell > 0 ? (totalRefund / totalSell) * 100 : 0;

                  return (
                    <div
                      key={shopName}
                      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-blue-500" />
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {shopName}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          {percentOfTotal.toFixed(1)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">
                            Продажи
                          </div>
                          <div className="font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(totalSell)} ₽
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">
                            Возвраты
                          </div>
                          <div className="font-semibold text-red-600 dark:text-red-400">
                            {formatCurrency(totalRefund)} ₽
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">
                            Чистая
                          </div>
                          <div className="font-semibold text-blue-600 dark:text-blue-400">
                            {formatCurrency(netShopSales)} ₽
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">
                            % возвратов
                          </div>
                          <div
                            className={`font-semibold ${
                              refundRate > 10
                                ? "text-red-600 dark:text-red-400"
                                : "text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            {refundRate.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      {/* Разбивка по формам оплаты */}
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Продажи по формам оплаты */}
                          <div>
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              Продажи по типу оплаты:
                            </div>
                            <div className="space-y-1">
                              {Object.entries(shopData.sell).length > 0 ? (
                                Object.entries(shopData.sell)
                                  .sort(([, a], [, b]) => b - a)
                                  .map(([paymentType, amount]) => (
                                    <div
                                      key={paymentType}
                                      className="flex justify-between items-center text-xs"
                                    >
                                      <span className="text-gray-600 dark:text-gray-400">
                                        {paymentType}
                                      </span>
                                      <span className="font-medium text-green-600 dark:text-green-400">
                                        {formatCurrency(amount)} ₽
                                      </span>
                                    </div>
                                  ))
                              ) : (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  Нет данных
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Возвраты по формам оплаты */}
                          <div>
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" />
                              Возвраты по типу оплаты:
                            </div>
                            <div className="space-y-1">
                              {Object.entries(shopData.refund).length > 0 ? (
                                Object.entries(shopData.refund)
                                  .sort(([, a], [, b]) => b - a)
                                  .map(([paymentType, amount]) => (
                                    <div
                                      key={paymentType}
                                      className="flex justify-between items-center text-xs"
                                    >
                                      <span className="text-gray-600 dark:text-gray-400">
                                        {paymentType}
                                      </span>
                                      <span className="font-medium text-red-600 dark:text-red-400">
                                        {formatCurrency(amount)} ₽
                                      </span>
                                    </div>
                                  ))
                              ) : (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  Нет данных
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${percentOfTotal}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

              {/* Итоговая сводка */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-gray-500 dark:text-gray-400 mb-1">
                      Общие продажи
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(filteredData.grandTotalSell)} ₽
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 dark:text-gray-400 mb-1">
                      Общие возвраты
                    </div>
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(filteredData.grandTotalRefund)} ₽
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 dark:text-gray-400 mb-1">
                      Чистая выручка
                    </div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(netSales)} ₽
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 dark:text-gray-400 mb-1">
                      Средний чек
                    </div>
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(averageCheck)} ₽
                    </div>
                  </div>
                </div>

                {/* Разбивка по формам оплаты */}
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                    Итоги по формам оплаты
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Общая выручка по формам оплаты */}
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                      <div className="text-sm font-semibold text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Общая выручка по типам оплаты:
                      </div>
                      <div className="space-y-2">
                        {(() => {
                          const totalsByPaymentType: Record<string, number> =
                            {};
                          Object.values(
                            filteredData.salesDataByShopName
                          ).forEach((shopData) => {
                            Object.entries(shopData.sell).forEach(
                              ([type, amount]) => {
                                totalsByPaymentType[type] =
                                  (totalsByPaymentType[type] || 0) + amount;
                              }
                            );
                          });
                          const grandTotal = Object.values(
                            totalsByPaymentType
                          ).reduce((sum, val) => sum + val, 0);
                          return Object.entries(totalsByPaymentType).length >
                            0 ? (
                            <>
                              {Object.entries(totalsByPaymentType)
                                .sort(([, a], [, b]) => b - a)
                                .map(([paymentType, amount]) => (
                                  <div
                                    key={paymentType}
                                    className="flex justify-between items-center text-sm py-1"
                                  >
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                                      {paymentType}
                                    </span>
                                    <span className="font-bold text-green-700 dark:text-green-400">
                                      {formatCurrency(amount)} ₽
                                    </span>
                                  </div>
                                ))}
                              <div className="flex justify-between items-center text-sm py-2 mt-2 pt-2 border-t border-green-200 dark:border-green-700">
                                <span className="text-gray-900 dark:text-white font-bold">
                                  Итого:
                                </span>
                                <span className="font-bold text-lg text-green-700 dark:text-green-400">
                                  {formatCurrency(grandTotal)} ₽
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              Нет данных
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Общие возвраты по формам оплаты */}
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                      <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2">
                        <RotateCcw className="w-4 h-4" />
                        Общие возвраты по типам оплаты:
                      </div>
                      <div className="space-y-2">
                        {(() => {
                          const refundsByPaymentType: Record<string, number> =
                            {};
                          Object.values(
                            filteredData.salesDataByShopName
                          ).forEach((shopData) => {
                            Object.entries(shopData.refund).forEach(
                              ([type, amount]) => {
                                refundsByPaymentType[type] =
                                  (refundsByPaymentType[type] || 0) + amount;
                              }
                            );
                          });
                          const grandTotal = Object.values(
                            refundsByPaymentType
                          ).reduce((sum, val) => sum + val, 0);
                          return Object.entries(refundsByPaymentType).length >
                            0 ? (
                            <>
                              {Object.entries(refundsByPaymentType)
                                .sort(([, a], [, b]) => b - a)
                                .map(([paymentType, amount]) => (
                                  <div
                                    key={paymentType}
                                    className="flex justify-between items-center text-sm py-1"
                                  >
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                                      {paymentType}
                                    </span>
                                    <span className="font-bold text-red-700 dark:text-red-400">
                                      {formatCurrency(amount)} ₽
                                    </span>
                                  </div>
                                ))}
                              <div className="flex justify-between items-center text-sm py-2 mt-2 pt-2 border-t border-red-200 dark:border-red-700">
                                <span className="text-gray-900 dark:text-white font-bold">
                                  Итого:
                                </span>
                                <span className="font-bold text-lg text-red-700 dark:text-red-400">
                                  {formatCurrency(grandTotal)} ₽
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              Нет данных
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {!isSuperAdmin && expandedCard === "revenue" && filteredData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="col-span-full mt-3 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Детальная разбивка выручки
              </h3>
              <button
                onClick={() => setExpandedCard(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-gray-500 dark:text-gray-400 mb-1">
                    Продажи
                  </div>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(filteredData.grandTotalSell)} ₽
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500 dark:text-gray-400 mb-1">
                    Возвраты
                  </div>
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    {formatCurrency(filteredData.grandTotalRefund)} ₽
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500 dark:text-gray-400 mb-1">
                    Чистая выручка
                  </div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(netSales)} ₽
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500 dark:text-gray-400 mb-1">
                    Средний чек
                  </div>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(averageCheck)} ₽
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Продажи по формам оплаты */}
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <div className="text-sm font-semibold text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Продажи по типам оплаты:
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const shopData = Object.values(
                        filteredData.salesDataByShopName
                      )[0];
                      return Object.entries(shopData.sell).length > 0 ? (
                        Object.entries(shopData.sell)
                          .sort(([, a], [, b]) => b - a)
                          .map(([paymentType, amount]) => (
                            <div
                              key={paymentType}
                              className="flex justify-between items-center text-sm py-1"
                            >
                              <span className="text-gray-700 dark:text-gray-300 font-medium">
                                {paymentType}
                              </span>
                              <span className="font-bold text-green-700 dark:text-green-400">
                                {formatCurrency(amount)} ₽
                              </span>
                            </div>
                          ))
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Нет данных
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Возвраты по формам оплаты */}
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Возвраты по типам оплаты:
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const shopData = Object.values(
                        filteredData.salesDataByShopName
                      )[0];
                      return Object.entries(shopData.refund).length > 0 ? (
                        Object.entries(shopData.refund)
                          .sort(([, a], [, b]) => b - a)
                          .map(([paymentType, amount]) => (
                            <div
                              key={paymentType}
                              className="flex justify-between items-center text-sm py-1"
                            >
                              <span className="text-gray-700 dark:text-gray-300 font-medium">
                                {paymentType}
                              </span>
                              <span className="font-bold text-red-700 dark:text-red-400">
                                {formatCurrency(amount)} ₽
                              </span>
                            </div>
                          ))
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Нет данных
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Расходы */}
        <motion.div
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.98 }}
          animate={isUpdating ? { scale: [1, 1.02, 1] } : {}}
          onClick={() =>
            setExpandedCard(expandedCard === "expenses" ? null : "expenses")
          }
          onMouseEnter={() => setHoveredCard("expenses")}
          onMouseLeave={() => setHoveredCard(null)}
          title="Нажмите для просмотра детального финансового отчёта"
          className={`bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700 text-white p-4 rounded-xl shadow-lg cursor-pointer relative overflow-hidden transition-all ${
            expandedCard === "expenses" && !isSuperAdmin
              ? "ring-4 ring-orange-300 dark:ring-orange-500"
              : ""
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium opacity-90">Расходы</span>
            <ShoppingCart className="w-5 h-5 opacity-80" />
          </div>
          <div className="text-2xl font-bold">
            <AnimatedNumber value={filteredData.grandTotalCashOutcome} /> ₽
          </div>
          {hoveredCard === "expenses" && (
            <div className="absolute top-0 right-0 bg-black/80 text-white text-xs px-2 py-1 rounded-bl-lg">
              {expandedCard === "expenses" ? "Свернуть" : "Развернуть детали"}
            </div>
          )}
        </motion.div>

        {/* Детальный отчет по расходам и прибыли - только для SuperAdmin */}
        {expandedCard === "expenses" && filteredData && isSuperAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="col-span-2 sm:col-span-2 lg:col-span-4 xl:col-span-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Детализация расходов
              </h3>
              <button
                onClick={() => setExpandedCard(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {/* Детализация расходов по магазинам */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Расходы по магазинам
              </h4>
              <div className="space-y-3">
                {Object.entries(filteredData.cashOutcomeData)
                  .sort(([, categoriesA], [, categoriesB]) => {
                    const totalA = Object.values(categoriesA).reduce(
                      (sum, val) => sum + val,
                      0
                    );
                    const totalB = Object.values(categoriesB).reduce(
                      (sum, val) => sum + val,
                      0
                    );
                    return totalB - totalA;
                  })
                  .map(([shopName, categories]) => {
                    const shopTotal = Object.values(categories).reduce(
                      (sum, val) => sum + val,
                      0
                    );
                    const shopPercentage =
                      filteredData.grandTotalCashOutcome > 0
                        ? (shopTotal / filteredData.grandTotalCashOutcome) * 100
                        : 0;

                    return (
                      <div
                        key={shopName}
                        className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-orange-500" />
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {shopName}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-orange-600 dark:text-orange-400">
                              {formatCurrency(shopTotal)} ₽
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {shopPercentage.toFixed(1)}% от общих расходов
                            </div>
                          </div>
                        </div>

                        {/* Разбивка по категориям для магазина */}
                        <div className="space-y-2 pl-6">
                          {Object.entries(categories)
                            .sort(([, a], [, b]) => b - a)
                            .map(([category, amount]) => {
                              const categoryPercentage =
                                shopTotal > 0 ? (amount / shopTotal) * 100 : 0;

                              return (
                                <div
                                  key={category}
                                  className="flex justify-between items-center text-sm"
                                >
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {category}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 dark:text-gray-500">
                                      {categoryPercentage.toFixed(0)}%
                                    </span>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">
                                      {formatCurrency(amount)} ₽
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>

                        {/* Progress bar для магазина */}
                        <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-500 transition-all duration-300"
                            style={{ width: `${shopPercentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Общий итог по всем магазинам */}
              <div className="mt-4 pt-4 border-t-2 border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900 dark:text-white">
                    Итого по всем магазинам:
                  </span>
                  <span className="text-xl font-bold text-orange-600 dark:text-orange-400">
                    {formatCurrency(filteredData.grandTotalCashOutcome)} ₽
                  </span>
                </div>
              </div>
            </div>

            {/* Разбивка расходов по категориям */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Расходы по категориям
              </h4>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                <div className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Общие расходы по категориям:
                </div>
                <div className="space-y-2">
                  {(() => {
                    const categorySums: Record<string, number> = {};

                    // Собираем расходы по категориям из всех магазинов
                    Object.values(filteredData.cashOutcomeData).forEach(
                      (categories) => {
                        Object.entries(categories).forEach(
                          ([category, amount]) => {
                            categorySums[category] =
                              (categorySums[category] || 0) + amount;
                          }
                        );
                      }
                    );

                    const grandTotal = Object.values(categorySums).reduce(
                      (sum, val) => sum + val,
                      0
                    );

                    return Object.entries(categorySums).length > 0 ? (
                      <>
                        {Object.entries(categorySums)
                          .sort(([, a], [, b]) => b - a)
                          .map(([category, amount]) => {
                            const percentage =
                              grandTotal > 0 ? (amount / grandTotal) * 100 : 0;
                            return (
                              <div key={category} className="space-y-1">
                                <div className="flex justify-between items-center text-sm py-1">
                                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                                    {category}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {percentage.toFixed(1)}%
                                    </span>
                                    <span className="font-bold text-orange-700 dark:text-orange-400">
                                      {formatCurrency(amount)} ₽
                                    </span>
                                  </div>
                                </div>
                                {/* Progress bar для каждой категории */}
                                <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-orange-500 transition-all duration-300"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        <div className="flex justify-between items-center text-sm py-2 mt-3 pt-3 border-t border-orange-200 dark:border-orange-700">
                          <span className="text-gray-900 dark:text-white font-bold">
                            Итого:
                          </span>
                          <span className="font-bold text-lg text-orange-700 dark:text-orange-400">
                            {formatCurrency(grandTotal)} ₽
                          </span>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Нет данных
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {!isSuperAdmin && expandedCard === "expenses" && filteredData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="col-span-full mt-3 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Детализация расходов
              </h3>
              <button
                onClick={() => setExpandedCard(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
              <div className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                Расходы по категориям:
              </div>
              <div className="space-y-2">
                {(() => {
                  const shopName = Object.keys(filteredData.cashOutcomeData)[0];
                  const categories =
                    filteredData.cashOutcomeData[shopName] || {};
                  const total = Object.values(categories).reduce(
                    (sum, val) => sum + val,
                    0
                  );

                  return Object.entries(categories).length > 0 ? (
                    <>
                      {Object.entries(categories)
                        .sort(([, a], [, b]) => b - a)
                        .map(([category, amount]) => {
                          const percentage =
                            total > 0 ? (amount / total) * 100 : 0;
                          return (
                            <div key={category} className="space-y-1">
                              <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-gray-700 dark:text-gray-300 font-medium">
                                  {category}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {percentage.toFixed(1)}%
                                  </span>
                                  <span className="font-bold text-orange-700 dark:text-orange-400">
                                    {formatCurrency(amount)} ₽
                                  </span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-orange-500 transition-all duration-300"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      <div className="flex justify-between items-center text-sm py-2 mt-3 pt-3 border-t border-orange-200 dark:border-orange-700">
                        <span className="text-gray-900 dark:text-white font-bold">
                          Итого:
                        </span>
                        <span className="font-bold text-lg text-orange-700 dark:text-orange-400">
                          {formatCurrency(total)} ₽
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Нет данных
                    </span>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        )}

        {/* Лучший магазин */}
        {bestShop && (
          <motion.div
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.98 }}
            animate={isUpdating ? { scale: [1, 1.02, 1] } : {}}
            onClick={() =>
              setExpandedCard(expandedCard === "best" ? null : "best")
            }
            onMouseEnter={() => setHoveredCard("best")}
            onMouseLeave={() => setHoveredCard(null)}
            title="Нажмите для просмотра детального сравнения магазинов"
            className="bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 text-white p-4 rounded-xl shadow-lg cursor-pointer relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium opacity-90">
                Топ магазин
              </span>
              <Award className="w-5 h-5 opacity-80" />
            </div>
            <div className="text-lg font-bold truncate">{bestShop.name}</div>
            <div className="text-xs opacity-75 mt-1">
              {formatCurrency(bestShop.sales)} ₽
            </div>
            {hoveredCard === "best" && (
              <div className="absolute top-0 right-0 bg-black/80 text-white text-xs px-2 py-1 rounded-bl-lg">
                {expandedCard === "best" ? "Свернуть" : "Развернуть детали"}
              </div>
            )}
          </motion.div>
        )}

        {/* Детальный анализ топ магазинов */}
        {expandedCard === "best" && filteredData && isSuperAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="col-span-2 sm:col-span-2 lg:col-span-4 xl:col-span-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                🏆 Топ-5 магазинов по выручке
              </h3>
              <button
                onClick={() => setExpandedCard(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {(() => {
              // Получаем топ-5 магазинов
              const sortedShops = Object.entries(
                filteredData.salesDataByShopName
              )
                .map(([name, shopData]) => ({
                  name,
                  totalSell: shopData.totalSell,
                  totalRefund: getTotalRefund(shopData),
                  netSales: shopData.totalSell - getTotalRefund(shopData),
                  checksCount: shopData.checksCount,
                  sell: shopData.sell,
                  refund: shopData.refund,
                }))
                .sort((a, b) => b.netSales - a.netSales)
                .slice(0, 5);

              const maxSales = sortedShops[0]?.netSales || 1;
              const totalNetSales =
                filteredData.grandTotalSell - filteredData.grandTotalRefund;
              const maxChecks = Math.max(
                ...sortedShops.map((s) => s.checksCount)
              );

              return (
                <div className="space-y-4">
                  {/* Круговая диаграмма + Столбцы */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Круговая диаграмма доли выручки */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
                        📊 Распределение выручки
                      </h4>
                      <div className="relative w-full aspect-square max-w-xs mx-auto">
                        <svg
                          viewBox="0 0 200 200"
                          className="transform -rotate-90"
                          role="img"
                          aria-label="Круговая диаграмма распределения выручки"
                        >
                          <title>
                            Круговая диаграмма распределения выручки
                          </title>
                          {(() => {
                            let currentAngle = 0;
                            const colors = [
                              "#EAB308", // yellow
                              "#9CA3AF", // gray
                              "#FB923C", // orange
                              "#A855F7", // purple
                              "#3B82F6", // blue
                            ];
                            return sortedShops.map((shop, index) => {
                              const percentage =
                                (shop.netSales / totalNetSales) * 100;
                              const angle = (percentage / 100) * 360;
                              const startAngle = currentAngle;
                              currentAngle += angle;

                              const startRad = (startAngle * Math.PI) / 180;
                              const endRad = (currentAngle * Math.PI) / 180;
                              const x1 = 100 + 80 * Math.cos(startRad);
                              const y1 = 100 + 80 * Math.sin(startRad);
                              const x2 = 100 + 80 * Math.cos(endRad);
                              const y2 = 100 + 80 * Math.sin(endRad);
                              const largeArc = angle > 180 ? 1 : 0;

                              return (
                                <g key={shop.name}>
                                  <path
                                    d={`M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                    fill={colors[index]}
                                    className="hover:opacity-80 transition-opacity cursor-pointer"
                                  />
                                </g>
                              );
                            });
                          })()}
                          <circle
                            cx="100"
                            cy="100"
                            r="45"
                            fill="white"
                            className="dark:fill-gray-800"
                          />
                        </svg>
                      </div>
                      <div className="mt-4 space-y-2">
                        {sortedShops.map((shop, index) => {
                          const colors = [
                            "bg-yellow-400",
                            "bg-gray-300",
                            "bg-orange-400",
                            "bg-purple-400",
                            "bg-blue-400",
                          ];
                          const percentage =
                            (shop.netSales / totalNetSales) * 100;
                          return (
                            <div
                              key={shop.name}
                              className="flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div
                                  className={`w-3 h-3 rounded-sm ${colors[index]}`}
                                />
                                <span className="text-gray-900 dark:text-white truncate">
                                  {shop.name}
                                </span>
                              </div>
                              <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2">
                                {percentage.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Анимированная столбчатая диаграмма */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-0">
                      <div className="flex items-center gap-2 mb-4 justify-center">
                        <BarChart3 className="w-5 h-5 text-purple-500" />
                        <h4 className="text-base font-bold text-gray-800 dark:text-gray-100">
                          Рейтинг по выручке
                        </h4>
                      </div>
                      <div className="space-y-4">
                        {sortedShops.map((shop, index) => {
                          const widthPercent = (shop.netSales / maxSales) * 100;

                          // Custom styling for top 3
                          let rankIcon: JSX.Element;
                          if (index === 0)
                            rankIcon = (
                              <Trophy className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                            );
                          else if (index === 1)
                            rankIcon = (
                              <Medal className="w-5 h-5 text-gray-400 fill-gray-400" />
                            );
                          else if (index === 2)
                            rankIcon = (
                              <Medal className="w-5 h-5 text-orange-400 fill-orange-400" />
                            );
                          else
                            rankIcon = (
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                                {index + 1}
                              </span>
                            );

                          return (
                            <div key={shop.name} className="group">
                              {/* Header Row */}
                              <div className="flex items-center justify-between text-sm mb-2">
                                <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                                  <div className="flex-shrink-0 w-6 flex justify-center">
                                    {rankIcon}
                                  </div>
                                  <div className="truncate">
                                    <div
                                      className="font-semibold text-gray-900 dark:text-white truncate"
                                      title={shop.name}
                                    >
                                      {shop.name}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className="font-bold text-gray-900 dark:text-white">
                                    {formatCurrency(shop.netSales)} ₽
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {(
                                      (shop.netSales / totalNetSales) *
                                      100
                                    ).toFixed(1)}
                                    %
                                  </div>
                                </div>
                              </div>

                              {/* Progress Track */}
                              <div className="relative h-2.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${widthPercent}%` }}
                                  transition={{
                                    duration: 1,
                                    delay: index * 0.1,
                                    ease: "easeOut",
                                  }}
                                  className={`absolute top-0 left-0 h-full rounded-full ${
                                    index === 0
                                      ? "bg-gradient-to-r from-yellow-400 to-yellow-600"
                                      : index === 1
                                        ? "bg-gradient-to-r from-gray-300 to-gray-500"
                                        : index === 2
                                          ? "bg-gradient-to-r from-orange-300 to-orange-500"
                                          : "bg-gradient-to-r from-purple-500 to-blue-500"
                                  }`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Многомерное сравнение метрик */}
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
                      🎯 Сравнение по метрикам
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Выручка */}
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">
                          💰 Выручка
                        </div>
                        {sortedShops.map((shop, index) => {
                          const percent = (shop.netSales / maxSales) * 100;
                          const colors = [
                            "bg-yellow-400",
                            "bg-gray-300",
                            "bg-orange-400",
                            "bg-purple-400",
                            "bg-blue-400",
                          ];
                          return (
                            <div
                              key={shop.name}
                              className="flex items-center gap-2"
                            >
                              <div className="w-16 text-xs text-gray-600 dark:text-gray-400 truncate">
                                #{index + 1}
                              </div>
                              <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percent}%` }}
                                  transition={{
                                    duration: 0.8,
                                    delay: index * 0.05,
                                  }}
                                  className={`h-full ${colors[index]}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Средний чек */}
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">
                          🎫 Средний чек
                        </div>
                        {sortedShops.map((shop, index) => {
                          const avgCheck =
                            shop.checksCount > 0
                              ? shop.netSales / shop.checksCount
                              : 0;
                          const maxAvgCheck = Math.max(
                            ...sortedShops.map((s) =>
                              s.checksCount > 0 ? s.netSales / s.checksCount : 0
                            )
                          );
                          const percent =
                            maxAvgCheck > 0
                              ? (avgCheck / maxAvgCheck) * 100
                              : 0;
                          const colors = [
                            "bg-yellow-400",
                            "bg-gray-300",
                            "bg-orange-400",
                            "bg-purple-400",
                            "bg-blue-400",
                          ];
                          return (
                            <div
                              key={shop.name}
                              className="flex items-center gap-2"
                            >
                              <div className="w-16 text-xs text-gray-600 dark:text-gray-400">
                                {formatCurrency(avgCheck)}
                              </div>
                              <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percent}%` }}
                                  transition={{
                                    duration: 0.8,
                                    delay: index * 0.05,
                                  }}
                                  className={`h-full ${colors[index]}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Количество чеков */}
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">
                          📋 Кол-во чеков
                        </div>
                        {sortedShops.map((shop, index) => {
                          const percent = (shop.checksCount / maxChecks) * 100;
                          const colors = [
                            "bg-yellow-400",
                            "bg-gray-300",
                            "bg-orange-400",
                            "bg-purple-400",
                            "bg-blue-400",
                          ];
                          return (
                            <div
                              key={shop.name}
                              className="flex items-center gap-2"
                            >
                              <div className="w-16 text-xs text-gray-600 dark:text-gray-400">
                                {shop.checksCount}
                              </div>
                              <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percent}%` }}
                                  transition={{
                                    duration: 0.8,
                                    delay: index * 0.05,
                                  }}
                                  className={`h-full ${colors[index]}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Компактная итоговая панель */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-6">
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                      <Store className="w-5 h-5 text-blue-500 mb-2" />
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {Object.keys(filteredData.salesDataByShopName).length}
                      </div>
                      <div className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
                        Магазинов
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                      <Percent className="w-5 h-5 text-purple-500 mb-2" />
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {(
                          (sortedShops.reduce(
                            (s, shop) => s + shop.netSales,
                            0
                          ) /
                            totalNetSales) *
                          100
                        ).toFixed(0)}
                        %
                      </div>
                      <div className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
                        Топ-5 от сети
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                      <TrendingUp className="w-5 h-5 text-orange-500 mb-2" />
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(
                          sortedShops.length >= 2
                            ? sortedShops[0].netSales - sortedShops[1].netSales
                            : 0
                        )}
                      </div>
                      <div className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
                        Разрыв 1-2
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                      <DollarSign className="w-5 h-5 text-green-500 mb-2" />
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(
                          sortedShops.reduce(
                            (s, shop) => s + shop.netSales,
                            0
                          ) /
                            sortedShops.reduce(
                              (s, shop) => s + shop.checksCount,
                              0
                            )
                        )}
                      </div>
                      <div className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
                        Ср. чек топ-5
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* Топ продукт */}
        {filteredData?.topProducts && filteredData.topProducts.length > 0 && (
          <motion.div
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.98 }}
            animate={isUpdating ? { scale: [1, 1.02, 1] } : {}}
            onClick={() =>
              setExpandedCard(expandedCard === "products" ? null : "products")
            }
            onMouseEnter={() => setHoveredCard("products")}
            onMouseLeave={() => setHoveredCard(null)}
            title="Нажмите для просмотра топ-продуктов"
            className="bg-gradient-to-br from-pink-500 to-rose-600 dark:from-pink-600 dark:to-rose-700 text-white p-4 rounded-xl shadow-lg cursor-pointer relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium opacity-90">
                Топ продукт
              </span>
              <ShoppingCart className="w-5 h-5 opacity-80" />
            </div>
            <div className="text-lg font-bold truncate">
              {filteredData.topProducts[0].productName}
            </div>
            <div className="text-xs opacity-75 mt-1">
              {formatCurrency(filteredData.topProducts[0].netRevenue)} ₽ •{" "}
              {filteredData.topProducts[0].netQuantity} шт
            </div>
            {hoveredCard === "products" && (
              <div className="absolute top-0 right-0 bg-black/80 text-white text-xs px-2 py-1 rounded-bl-lg">
                {expandedCard === "products" ? "Свернуть" : "Развернуть детали"}
              </div>
            )}
          </motion.div>
        )}

        {/* Детальный анализ топ продуктов */}
        {expandedCard === "products" &&
          filteredData &&
          filteredData.topProducts && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="col-span-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  🏆 Топ-10 продуктов по выручке
                </h3>
                <button
                  onClick={() => setExpandedCard(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>

              {(() => {
                const topProducts = filteredData.topProducts.slice(0, 10);
                const maxRevenue = topProducts[0]?.netRevenue || 1;
                const totalRevenue = topProducts.reduce(
                  (s, p) => s + p.netRevenue,
                  0
                );
                // const maxQuantity = Math.max(
                //   ...topProducts.map((p) => p.netQuantity)
                // );

                return (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-0">
                      <div className="flex items-center gap-2 mb-6 justify-center">
                        <BarChart3 className="w-5 h-5 text-pink-500" />
                        <h4 className="text-base font-bold text-gray-800 dark:text-gray-100">
                          Рейтинг по выручке
                        </h4>
                      </div>

                      <div className="space-y-4">
                        {topProducts.map((product, index) => {
                          const widthPercent =
                            (product.netRevenue / maxRevenue) * 100;

                          // Custom styling for top 3
                          let rankIcon: JSX.Element;
                          if (index === 0)
                            rankIcon = (
                              <Trophy className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                            );
                          else if (index === 1)
                            rankIcon = (
                              <Medal className="w-5 h-5 text-gray-400 fill-gray-400" />
                            );
                          else if (index === 2)
                            rankIcon = (
                              <Medal className="w-5 h-5 text-orange-400 fill-orange-400" />
                            );
                          else
                            rankIcon = (
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                                {index + 1}
                              </span>
                            );

                          return (
                            <div key={product.productName} className="group">
                              {/* Header Row */}
                              <div className="flex items-center justify-between text-sm mb-2">
                                <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                                  <div className="flex-shrink-0 w-6 flex justify-center">
                                    {rankIcon}
                                  </div>
                                  <div className="truncate">
                                    <div
                                      className="font-semibold text-gray-900 dark:text-white truncate"
                                      title={product.productName}
                                    >
                                      {product.productName}
                                    </div>
                                    {product.refundRate > 5 && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <AlertTriangle className="w-3 h-3 text-red-500" />
                                        <span className="text-xs text-red-500 font-medium">
                                          Высокие возвраты:{" "}
                                          {product.refundRate.toFixed(1)}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className="font-bold text-gray-900 dark:text-white">
                                    {formatCurrency(product.netRevenue)} ₽
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {product.netQuantity} шт
                                  </div>
                                </div>
                              </div>

                              {/* Progress Track */}
                              <div className="relative h-2.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${widthPercent}%` }}
                                  transition={{
                                    duration: 1,
                                    delay: index * 0.05,
                                    ease: "easeOut",
                                  }}
                                  className={`absolute top-0 left-0 h-full rounded-full ${
                                    index === 0
                                      ? "bg-gradient-to-r from-yellow-400 to-yellow-600"
                                      : index === 1
                                        ? "bg-gradient-to-r from-gray-300 to-gray-500"
                                        : index === 2
                                          ? "bg-gradient-to-r from-orange-300 to-orange-500"
                                          : "bg-gradient-to-r from-pink-500 to-rose-500"
                                  }`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Summary Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-6">
                      <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                        <Package className="w-5 h-5 text-blue-500 mb-2" />
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {filteredData.topProducts.length}
                        </div>
                        <div className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
                          Всего товаров
                        </div>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                        <Percent className="w-5 h-5 text-purple-500 mb-2" />
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {((totalRevenue / netSales) * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
                          Доля топ-10
                        </div>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                        <Tags className="w-5 h-5 text-green-500 mb-2" />
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {formatCurrency(
                            totalRevenue /
                              topProducts.reduce((s, p) => s + p.netQuantity, 0)
                          )}
                        </div>
                        <div className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
                          Ср. цена
                        </div>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                        <ShoppingCart className="w-5 h-5 text-orange-500 mb-2" />
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {topProducts.reduce((s, p) => s + p.netQuantity, 0)}
                        </div>
                        <div className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
                          Продано шт
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}

        {/* Скорость - удалено */}
      </div>
    </div>
  );
}
