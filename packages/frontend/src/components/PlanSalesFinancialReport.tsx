import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone,
  Clock,
  DollarSign,
  Banknote,
  RotateCcw,
  Package,
  BarChart3,
} from "lucide-react";
import ShopSalesMiniChart from "./ShopSalesMiniChart";
import { useGetReportAndPlan } from "../hooks/useReportData";
import { useShopCharts } from "../hooks/useShopCharts";
import { useGetShopNames } from "../hooks/useGetShopNames";
import { useOpenTimes } from "../hooks/useOpenTimes";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

// Форматирование суммы
const formatAmount = (amount: number): number | string => {
  const roundedSum = amount.toFixed(2);
  if (Number.parseFloat(roundedSum) % 1 === 0) {
    return Number.parseInt(roundedSum, 10);
  }
  return Number.parseFloat(roundedSum);
};

// Компонент списка ключ-значение
const renderKeyValueList = (
  data: Record<string, number> | null | undefined,
  loading: boolean,
  emptyMessage = "Данные отсутствуют"
) => {
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="w-2/3 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="w-4/5 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }
  if (!data || Object.keys(data).length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
    );
  }
  return (
    <ul className="space-y-2">
      {Object.entries(data).map(([key, value]) => (
        <li
          key={key}
          className="flex justify-between items-center text-gray-800 dark:text-gray-200 text-sm py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
        >
          <span className="font-medium">{key}</span>
          <span className="font-bold text-blue-600 dark:text-blue-400">
            {formatAmount(value)} ₽
          </span>
        </li>
      ))}
    </ul>
  );
};

export default function PlanSalesFinancialReport() {
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
  const [openedShop, setOpenedShop] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const chartData = useShopCharts(openedShop);
  const openTimes = useOpenTimes();

  const isMiniApp = isTelegramMiniApp();

  // Инициализация Telegram WebApp
  useEffect(() => {
    if (isMiniApp) {
      // Устанавливаем цвет фона
      const theme = telegram.WebApp.colorScheme;
      telegram.WebApp.setBackgroundColor(
        theme === "dark" ? "#1f2937" : "#2563eb"
      );

      // Включаем подтверждение закрытия
      telegram.WebApp.enableClosingConfirmation();

      // Отслеживаем изменение размера окна
      const handleViewportChanged = () => {
        setIsExpanded(telegram.WebApp.isExpanded);
      };

      telegram.WebApp.onEvent("viewportChanged", handleViewportChanged);
      setIsExpanded(telegram.WebApp.isExpanded);

      return () => {
        telegram.WebApp.offEvent("viewportChanged", handleViewportChanged);
        telegram.WebApp.disableClosingConfirmation();
      };
    }
  }, []);

  // Управление кнопкой "Назад" при открытии деталей магазина
  useEffect(() => {
    if (isMiniApp) {
      if (openedShop) {
        telegram.WebApp.BackButton.show();
        telegram.WebApp.BackButton.onClick(closeShopDetails);
      } else {
        telegram.WebApp.BackButton.hide();
        telegram.WebApp.BackButton.offClick(closeShopDetails);
      }

      return () => {
        telegram.WebApp.BackButton.hide();
        telegram.WebApp.BackButton.offClick(closeShopDetails);
      };
    }
  }, [openedShop]);

  // Функция для разворачивания окна
  const expandApp = useCallback(() => {
    if (isMiniApp && !isExpanded) {
      telegram.WebApp.expand();
      telegram.WebApp.HapticFeedback.impactOccurred("medium");
    }
  }, [isExpanded]);

  // Функция закрытия деталей магазина с тактильной отдачей
  const closeShopDetails = useCallback(() => {
    setOpenedShop(null);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
    }
  }, []);

  // Функция переключения деталей магазина с тактильной отдачей
  const toggleShopDetails = useCallback(
    (shopName: string) => {
      const willOpen = openedShop !== shopName;
      setOpenedShop(willOpen ? shopName : null);

      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");

        // Разворачиваем окно при открытии деталей для лучшего отображения
        if (willOpen && !isExpanded) {
          telegram.WebApp.expand();
        }
      }
    },
    [openedShop, isExpanded]
  );

  // Функция для показа уведомления о загрузке
  const showLoadingNotification = useCallback(() => {
    if (isMiniApp && loading) {
      telegram.WebApp.showPopup({
        title: "Загрузка данных",
        message: "Пожалуйста, подождите...",
        buttons: [{ type: "close" }],
      });
    }
  }, [loading]);

  if (shopsError) {
    // Показываем уведомление об ошибке в Telegram
    if (isMiniApp) {
      telegram.WebApp.showAlert(
        `Ошибка загрузки магазинов: ${shopsError.message}`
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-red-500 text-center mt-4 text-sm"
      >
        Ошибка загрузки магазинов: {shopsError.message}
      </motion.div>
    );
  }

  const reportData = error ? null : (data?.reportData ?? null);
  const planData = error ? null : (data?.planData ?? null);

  return (
    <div className="w-full mb-8">
      {/* Заголовок секции */}

      {/* Кнопка разворачивания для Telegram */}
      {isMiniApp && !isExpanded && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={expandApp}
          className="w-full mb-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl text-sm font-medium hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
        >
          <Smartphone className="w-5 h-5" />
          Развернуть на весь экран для лучшего обзора
        </motion.button>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shopNames.map((shopName) => {
          const data = reportData?.salesDataByShopName[shopName] || {
            sell: {},
            refund: {},
            totalSell: 0,
          };
          const plan = planData?.[shopName]?.datePlan ?? null;
          const planSales = planData?.[shopName]?.dataSales ?? null;
          const planQuantity = planData?.[shopName]?.dataQuantity ?? null;

          const isPlanMet =
            plan !== null && planSales !== null ? planSales >= plan : null;

          const statusText =
            isPlanMet === null
              ? "Нет данных"
              : isPlanMet
                ? "✅ План выполнен"
                : "❌ План не выполнен";

          const statusClass =
            isPlanMet === null
              ? "text-blue-500"
              : isPlanMet
                ? "text-green-500"
                : "text-red-500";

          const planQuantityArray = planQuantity
            ? Object.entries(planQuantity).map(([productName, quantity]) => ({
                productName,
                quantity,
              }))
            : [];

          // Определяем градиент в зависимости от статуса плана
          const gradientClass =
            isPlanMet === null
              ? "from-blue-500 to-blue-600"
              : isPlanMet
                ? "from-green-500 to-green-600"
                : "from-red-500 to-red-600";

          return (
            <motion.li
              key={shopName}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Градиентная полоска сверху */}
              <div className={`h-1.5 bg-gradient-to-r ${gradientClass}`} />

              <button
                onClick={() => toggleShopDetails(shopName)}
                className="w-full text-left p-3"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <strong className="text-sm font-bold text-gray-900 dark:text-white block mb-0.5">
                      {shopName}
                    </strong>
                    {openTimes.data?.[shopName] && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {openTimes.data[shopName]}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full ${statusClass} ${
                      isPlanMet === null
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : isPlanMet
                          ? "bg-green-50 dark:bg-green-900/30"
                          : "bg-red-50 dark:bg-red-900/30"
                    }`}
                  >
                    {statusText}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      План:
                    </p>
                    {loading || shopsLoading ? (
                      <div className="w-full h-5 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
                    ) : (
                      <p className="font-bold text-sm text-gray-900 dark:text-white">
                        {plan !== null ? formatAmount(plan) : "-"} ₽
                      </p>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Продажи:
                    </p>
                    {loading ? (
                      <div className="w-full h-5 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
                    ) : (
                      <p className="font-bold text-sm text-gray-900 dark:text-white">
                        {planSales !== null
                          ? `${formatAmount(planSales)} ₽`
                          : "Нет данных"}
                      </p>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Выручка:
                    </p>
                    {loading ? (
                      <div className="w-full h-5 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
                    ) : (
                      <p className="font-bold text-sm text-gray-900 dark:text-white">
                        {formatAmount(data.totalSell)} ₽
                      </p>
                    )}
                  </div>
                </div>
              </button>

              <AnimatePresence>
                {openedShop === shopName && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="border-t border-gray-200 dark:border-gray-700"
                  >
                    <div className="p-5 space-y-5 bg-gray-50 dark:bg-gray-700/30">
                      <section className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <DollarSign className="w-4 h-4" /> Продажи по типам
                          оплаты
                        </h4>
                        {renderKeyValueList(data.sell, loading)}
                      </section>

                      <section className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <Banknote className="w-4 h-4" /> Выплаты
                        </h4>
                        {renderKeyValueList(
                          reportData?.cashOutcomeData?.[shopName],
                          loading
                        )}
                      </section>

                      {Object.keys(data.refund).length > 0 && (
                        <section className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <RotateCcw className="w-4 h-4" /> Возвраты
                          </h4>
                          {renderKeyValueList(data.refund, loading)}
                        </section>
                      )}

                      <section className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <Package className="w-4 h-4" /> План по товарам
                        </h4>
                        {planQuantityArray.length > 0 ? (
                          <ul className="space-y-2">
                            {planQuantityArray.map((item) => (
                              <li
                                key={`${shopName}-${item.productName}`}
                                className="flex justify-between text-gray-800 dark:text-gray-200 text-sm py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                              >
                                <span className="font-medium">
                                  {item.productName}
                                </span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">
                                  {String(item.quantity)} шт.
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Данные отсутствуют
                          </p>
                        )}
                      </section>

                      <section className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" /> График продаж
                        </h4>
                        {chartData.isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                          </div>
                        ) : chartData.error ? (
                          <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                            Ошибка загрузки: {chartData.error.message}
                          </p>
                        ) : chartData.data?.[shopName] ? (
                          <div className="w-full overflow-x-auto">
                            <ShopSalesMiniChart
                              todayData={chartData.data[shopName].nowDataSales}
                              sevenDaysAgoData={
                                chartData.data[shopName].sevenDaysDataSales
                              }
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Нет данных
                          </p>
                        )}
                      </section>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>

      {/* Кнопка для показа уведомления о загрузке */}
      {isMiniApp && loading && (
        <div className="fixed bottom-4 right-4">
          <button
            onClick={showLoadingNotification}
            className="bg-blue-500 text-white p-3 rounded-full shadow-lg hover:bg-blue-600 transition-colors"
          >
            ⏳
          </button>
        </div>
      )}
    </div>
  );
}
