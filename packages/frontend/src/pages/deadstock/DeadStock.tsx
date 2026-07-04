import { useEffect, useState, useCallback } from "react";
import { useMe } from "../../hooks/useApi";
import { motion } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { telegram, isTelegramMiniApp } from "../../helpers/telegram";
import { client } from "../../helpers/api";
import { ErrorState, LoadingState } from "@shared/ui/states";
import { DynamicTableDeadStocks } from "@widgets/deadstock";
import { DateRangePicker, GroupSelector, ShopSelector } from "@widgets/reports";

interface GroupOption {
  name: string;
  uuid: string;
}

interface ReportDataItem {
  name: string;
  quantity: number;
  sold: number;
  lastSaleDate: string | null;
}

interface ReportData {
  salesData: ReportDataItem[];
  shopName: string;
  startDate: string;
  endDate: string;
}

export default function DeadSt() {
  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  // Состояния для отслеживания открытых модальных окон
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isShopSelectorOpen, setIsShopSelectorOpen] = useState(false);
  const [isGroupSelectorOpen, setIsGroupSelectorOpen] = useState(false);

  const isMiniApp = isTelegramMiniApp();

  useTelegramBackButton();

  const { data } = useMe();
  const userId = data?.id?.toString() || "";

  const isFormValid =
    !!startDate && !!endDate && !!selectedShop && selectedGroups.length > 0;

  // Проверяем, что все модальные окна закрыты
  const areAllModalsClosed =
    !isDatePickerOpen && !isShopSelectorOpen && !isGroupSelectorOpen;

  // 🔹 Функция генерации отчёта с useCallback
  const submitForecast = useCallback(async () => {
    if (!isFormValid) {
      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");
      } else {
        alert("Пожалуйста, выберите все параметры для формирования отчёта.");
      }
      return;
    }

    setIsLoadingReport(true);
    if (isMiniApp) {
      telegram.WebApp.MainButton.showProgress(true);
    }
    try {
      const response = await client.api.deadStocks.data.$post({
        json: {
          startDate,
          endDate,
          shopUuid: selectedShop,
          groups: selectedGroups,
        },
      });

      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);

      const result = await response.json();

      // 🔹 Проверяем, что пришли данные отчёта
      if (
        "salesData" in result &&
        "shopName" in result &&
        "startDate" in result &&
        "endDate" in result
      ) {
        setReportData(result as ReportData);
        setError(null);
      } else {
        setReportData(null);
        setError("Не удалось получить корректные данные отчёта");
      }
    } catch (err) {
      console.error(err);
      setError("Не удалось получить отчёт");
      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");
      }
    } finally {
      setIsLoadingReport(false);
      if (isMiniApp) {
        telegram.WebApp.MainButton.showProgress(false);
      }
    }
  }, [
    startDate,
    endDate,
    selectedShop,
    selectedGroups,
    isFormValid,
    isMiniApp,
  ]);

  // 🔹 Инициализация Telegram Mini App
  useEffect(() => {
    if (!isMiniApp) return;

    // Настройка темы
    const theme = telegram.WebApp.colorScheme;
    document.documentElement.classList.toggle("dark", theme === "dark");

    // Установка цвета фона
    telegram.WebApp.setBackgroundColor(
      theme === "dark" ? "#111827" : "#f9fafb"
    );

    // Настройка главной кнопки
    telegram.WebApp.MainButton.setText("Сгенерировать отчёт");
    telegram.WebApp.MainButton.setParams({
      color: "#0088cc",
      text_color: "#ffffff",
    });

    const handleGenerate = () => {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
      submitForecast();
    };

    telegram.WebApp.MainButton.onClick(handleGenerate);

    return () => {
      // Очистка при размонтировании
      telegram.WebApp.MainButton.offClick(handleGenerate);
    };
  }, [isMiniApp, submitForecast]);

  // 🔹 Управление видимостью MainButton с учётом модальных окон
  useEffect(() => {
    if (!isMiniApp) return;

    if (
      isFormValid &&
      !error &&
      !isLoadingReport &&
      !reportData &&
      areAllModalsClosed
    ) {
      telegram.WebApp.MainButton.show();
    } else {
      telegram.WebApp.MainButton.hide();
    }
  }, [
    isMiniApp,
    isFormValid,
    error,
    isLoadingReport,
    reportData,
    areAllModalsClosed,
  ]);

  // 🔹 Загрузка магазинов
  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoadingShops(true);
      try {
        const response = await client.api.evotor.shops.$post({
          json: { userId },
        });

        if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
        const data = await response.json();
        setShopOptions(data.shopOptions);
        if (Object.keys(data.shopOptions).length > 0) {
          const defaultShopUuid = Object.keys(data.shopOptions)[0];
          setSelectedShop(defaultShopUuid);
          await fetchGroups(defaultShopUuid);
        }
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить магазины");
      } finally {
        setIsLoadingShops(false);
      }
    };
    if (userId) fetchSalesData();
  }, [userId]);

  // 🔹 Загрузка групп
  const fetchGroups = async (shopUuid: string) => {
    setIsLoadingGroups(true);
    try {
      const response = await client.api.evotor["groups-by-shop"].$post({
        json: { shopUuid },
      });

      if (!response.ok)
        throw new Error(`Ошибка загрузки групп: ${response.status}`);
      const data = (await response.json()) as
        | { groups: GroupOption[] }
        | { code: string; message: string; details?: unknown };
      if (!("groups" in data)) {
        throw new Error(data.message || "Не удалось загрузить группы");
      }
      setGroupOptions(data.groups || []);
      setSelectedGroups([]);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить группы для выбранного магазина");
    } finally {
      setIsLoadingGroups(false);
    }
  };

  // 🔹 Форматирование дат
  const formatDate = (date: Date) =>
    `${date.getDate().toString().padStart(2, "0")} ${date.toLocaleString(
      "default",
      {
        month: "short",
      }
    )}`;

  const formatPeriod = (
    shopName: string,
    startDate: string,
    endDate: string
  ): string => {
    const formattedStartDate = formatDate(new Date(startDate));
    const formattedEndDate = formatDate(new Date(endDate));
    return `${shopName}, ${formattedStartDate} → ${formattedEndDate}`;
  };

  // 🔹 Состояния загрузки / ошибки
  if (isLoadingReport) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  // 🔹 Нет магазинов
  if (!Object.keys(shopOptions).length) {
    return (
      <div className="app-page flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingState />
      </div>
    );
  }

  // 🔹 Отчёт готов
  if (reportData) {
    const { salesData, startDate, endDate, shopName } = reportData;
    const tableData = salesData.map((item) => ({
      name: item.name, // ← исправлено
      quantity: item.quantity,
      sold: item.sold,
      lastSaleDate: item.lastSaleDate,
    }));

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="app-page w-full bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col items-center"
      >
        <motion.div
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-none shadow-lg p-4 w-full"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            height: "100%",
            maxWidth: "100%", // 🟦 РАСТЯГИВАЕМ НА ВСЮ ШИРИНУ
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h1 className="text-lg sm:text-xl font-semibold mb-2 px-2">
            {formatPeriod(shopName, startDate, endDate)}
          </h1>

          {/* <p className="text-gray-600 dark:text-gray-400 mb-4 px-2">
            Общая сумма продаж:{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {Object.values(salesData)
                .reduce((acc, item) => acc + item.sum, 0)
                .toLocaleString("ru-RU")}{" "}
              ₽
            </span>
          </p> */}

          {/* 🟦 Таблица во всю ширину */}
          <div className="flex-1 min-h-0 w-full">
            <DynamicTableDeadStocks
              data={tableData}
              shopUuid={selectedShop ?? ""}
            />
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // 🔹 Основной экран
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="app-page w-full px-4 sm:px-6 py-6 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col items-center"
    >
      <motion.h1
        className="text-xl sm:text-2xl font-semibold mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Запрос товара без продаж
      </motion.h1>
      <motion.div
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg p-4 sm:p-6 w-full max-w-3xl space-y-5"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <DateRangePicker
          onDateChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
          onOpenChange={setIsDatePickerOpen}
        />
        <ShopSelector
          shopOptions={shopOptions}
          isLoadingShops={isLoadingShops}
          fetchGroups={fetchGroups}
          selectedShop={selectedShop}
          setSelectedShop={setSelectedShop}
          onOpenChange={setIsShopSelectorOpen}
        />
        <GroupSelector
          groupOptions={groupOptions}
          selectedGroups={selectedGroups}
          setSelectedGroups={setSelectedGroups}
          isLoadingGroups={isLoadingGroups}
          onOpenChange={setIsGroupSelectorOpen}
        />
        {!isMiniApp && (
          <motion.button
            onClick={submitForecast}
            className={`w-full py-3 rounded-xl font-medium text-white transition ${
              isFormValid
                ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
            }`}
            disabled={!isFormValid}
            whileHover={{ scale: isFormValid ? 1.03 : 1 }}
            whileTap={{ scale: isFormValid ? 0.97 : 1 }}
          >
            Сгенерировать отчёт
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
