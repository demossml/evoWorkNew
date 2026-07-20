import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMe, useEmployeeRole } from "../../hooks/useApi";
import { motion } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { telegram, isTelegramMiniApp } from "../../helpers/telegram";
import { client } from "../../helpers/api";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger, Calendar } from "../../components/ui";
import { fetchEvotorShops, fetchGroupsByShop, queryKeys } from "@shared/api";
import { ErrorState, LoadingState } from "@shared/ui/states";
import {
  AiInsights,
  type AiInsightsData,
  DynamicTableSalesReport,
  GroupSelector,
  ShopSelector,
} from "@widgets/reports";
import { ReportHeader, ReportKPIBar, ReportShareButton, ShareReportButton } from "@shared/ui";
import { TrendingUp } from "lucide-react";

interface GroupOption {
  name: string;
  uuid: string;
}

interface ReportData {
  salesData: Record<string, { quantitySale: number; sum: number; costTotal?: number }>;
  shopName: string;
  startDate: string;
  endDate: string;
}

interface SalesReportSavedFilters {
  selectedShop: string | null;
  groupsByShop: Record<string, string[]>;
}

export default function SalesReport() {
  const queryClient = useQueryClient();
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "period">(
    "today"
  );
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

  // AI Insights state
  const [aiInsights, setAiInsights] = useState<AiInsightsData | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [showAiInsights, setShowAiInsights] = useState(false);

  // Состояния для отслеживания открытых модальных окон
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isShopSelectorOpen, setIsShopSelectorOpen] = useState(false);
  const [isGroupSelectorOpen, setIsGroupSelectorOpen] = useState(false);
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(undefined);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  const isMiniApp = isTelegramMiniApp();

  const reportRef = useRef<HTMLDivElement>(null);

  useTelegramBackButton();

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    const now = new Date();
    if (dateMode === "today") {
      const today = formatLocalDate(now);
      setStartDate(today);
      setEndDate(today);
      return;
    }
    if (dateMode === "yesterday") {
      const yesterdayDate = new Date(now);
      yesterdayDate.setDate(now.getDate() - 1);
      const yesterday = formatLocalDate(yesterdayDate);
      setStartDate(yesterday);
      setEndDate(yesterday);
      return;
    }
    if (dateMode !== "period") {
      setIsDatePickerOpen(false);
      setShowPeriodPicker(false);
      setTempPeriod(undefined);
    }
  }, [dateMode]);

  useEffect(() => {
    if (dateMode !== "period" || !period?.from || !period?.to) return;
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [dateMode, period]);

  const { data } = useMe();
  const { data: roleData } = useEmployeeRole();
  const isAdmin = roleData?.employeeRole === "ADMIN" || roleData?.employeeRole === "SUPERADMIN";
  const [showProfit, setShowProfit] = useState(false);
  const userId = data?.id?.toString() || "";
  const storageKey = userId ? `salesReportFilters:${userId}` : "";

  const readSavedFilters = (): SalesReportSavedFilters | null => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SalesReportSavedFilters>;
      if (!parsed || typeof parsed !== "object") return null;
      return {
        selectedShop:
          typeof parsed.selectedShop === "string" ? parsed.selectedShop : null,
        groupsByShop:
          parsed.groupsByShop && typeof parsed.groupsByShop === "object"
            ? parsed.groupsByShop
            : {},
      };
    } catch {
      return null;
    }
  };

  const isFormValid =
    !!startDate && !!endDate && !!selectedShop &&
    (selectedGroups.length > 0 || selectedShop === "all");

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
      const response = await client.api.evotor.salesResult.$post({
        json: {
          startDate,
          endDate,
          shopUuid: selectedShop,
          groups: selectedGroups,
        },
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      const json = await response.json();
      if (
        !json ||
        typeof json !== "object" ||
        !("salesData" in json) ||
        !("shopName" in json) ||
        !("startDate" in json) ||
        !("endDate" in json)
      ) {
        throw new Error("Некорректный формат отчёта");
      }
      const report = json as ReportData;
      setReportData(report);
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
        const data = await queryClient.fetchQuery({
          queryKey: queryKeys.reports.sales.shops(userId),
          queryFn: () => fetchEvotorShops(userId),
          staleTime: 5 * 60_000,
        });

        setShopOptions({ all: "Все магазины", ...data.shopOptions });
        if (Object.keys(data.shopOptions).length > 0) {
          const availableShopUuids = Object.keys(data.shopOptions);
          const saved = readSavedFilters();
          const savedShopUuid = saved?.selectedShop;
          const nextShopUuid =
            savedShopUuid && availableShopUuids.includes(savedShopUuid)
              ? savedShopUuid
              : availableShopUuids[0];
          setSelectedShop(nextShopUuid);
          await fetchGroups(nextShopUuid);
        }
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить магазины");
      } finally {
        setIsLoadingShops(false);
      }
    };
    if (userId) fetchSalesData();
  }, [queryClient, userId]);

  // 🔹 Загрузка групп
  const fetchGroups = async (shopUuid: string) => {
    // Для «Все магазины» группы не загружаем — показываем все товары
    if (shopUuid === "all") {
      setGroupOptions([]);
      setSelectedGroups([]);
      setIsLoadingGroups(false);
      return;
    }
    setIsLoadingGroups(true);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.reports.sales.groups(shopUuid),
        queryFn: () => fetchGroupsByShop(shopUuid),
        staleTime: 5 * 60_000,
      });

      if (
        data &&
        typeof data === "object" &&
        "groups" in data &&
        Array.isArray(data.groups)
      ) {
        const nextGroupOptions = (data as { groups: GroupOption[] }).groups;
        setGroupOptions(nextGroupOptions);
        setSelectedGroups([]);
      } else {
        setGroupOptions([]);
        setSelectedGroups([]);
      }
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить группы для выбранного магазина");
    } finally {
      setIsLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (!storageKey || !selectedShop) return;
    const saved = readSavedFilters() ?? {
      selectedShop: null,
      groupsByShop: {},
    };
    saved.selectedShop = selectedShop;
    saved.groupsByShop = {
      ...saved.groupsByShop,
      [selectedShop]: selectedGroups,
    };
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }, [storageKey, selectedShop, selectedGroups]);

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

  const formatMoney = (value: number) => {
    if (value == null || Number.isNaN(value)) return "0";
    return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  };

  // 🔹 AI Анализ
  const runAiAnalysis = async () => {
    if (!selectedShop || !startDate || !endDate) return;

    setIsLoadingAi(true);
    setShowAiInsights(true);
    try {
      const response = await client.api.ai.insights.$post({
        json: {
          startDate,
          endDate,
          shopUuid: selectedShop,
        },
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      const data: AiInsightsData = await response.json();
      setAiInsights(data);
    } catch (err) {
      console.error(err);
      setError("Не удалось получить AI анализ");
    } finally {
      setIsLoadingAi(false);
    }
  };

  // 🔹 Состояния загрузки / ошибки
  if (isLoadingReport) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  // 🔹 Нет магазинов
  if (!Object.keys(shopOptions).length) {
    return (
      <div
        className="app-page flex items-center justify-center bg-background"
        style={{
          paddingTop: "calc(var(--app-top-clearance) + 0.5rem)",
          paddingBottom: "calc(var(--app-bottom-clearance) + 0.5rem)",
        }}
      >
        <LoadingState />
      </div>
    );
  }

  // 🔹 Отчёт готов
  if (reportData) {
    const { salesData, startDate, endDate, shopName } = reportData;
    const tableData = Object.entries(salesData).map(
      ([productName, { quantitySale, sum, costTotal }]) => ({
        productName,
        quantitySale,
        sum,
        costTotal: costTotal ?? 0,
        profit: sum - (costTotal ?? 0),
      })
    );
    const totalRevenue = Object.values(salesData).reduce(
      (acc, item) => acc + item.sum,
      0
    );
    const totalCost = Object.values(salesData).reduce(
      (acc, item) => acc + (item.costTotal ?? 0),
      0
    );
    const totalProfit = totalRevenue - totalCost;
    const totalQuantity = Object.values(salesData).reduce(
      (acc, item) => acc + item.quantitySale,
      0
    );
    const skuCount = tableData.length;
    const avgPerSku = skuCount > 0 ? (showProfit ? totalProfit : totalRevenue) / skuCount : 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="app-page w-full bg-background text-foreground flex flex-col items-center"
        style={{
          paddingTop: "var(--app-top-clearance)",
          paddingBottom: "calc(var(--app-bottom-clearance) + 0.5rem)",
        }}
      >
        <motion.div
          className="w-full max-w-6xl px-4 sm:px-6 pt-1 pb-4 space-y-3"
          ref={reportRef}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="rounded-2xl bg-card p-3 sm:p-4 shadow-sm border border-border space-y-2">
            <div className="flex items-start justify-between gap-2">
              <ReportHeader
                title="Отчёт по продажам"
                subtitle={formatPeriod(shopName, startDate, endDate)}
              />
              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowProfit(!showProfit)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      showProfit
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    {showProfit ? "Прибыль" : "Выручка"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setReportData(null);
                    setShowAiInsights(false);
                  }}
                  className="rounded-lg px-3 py-2 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition"
                >
                  Изменить
                </button>
                <ShareReportButton since={startDate} until={endDate} reportType="revenue" />
              </div>
            </div>

            <ReportKPIBar compact items={[
              {
                label: showProfit ? "Валовая прибыль" : "Выручка",
                value: `${formatMoney(showProfit ? totalProfit : totalRevenue)} ₽`,
                emphasis: "primary",
              },
              { label: "Продано, шт", value: formatMoney(totalQuantity) },
              { label: "SKU в отчете", value: formatMoney(skuCount) },
              {
                label: showProfit ? "Прибыль на SKU" : "Среднее на SKU",
                value: `${formatMoney(avgPerSku)} ₽`,
              },
            ]} />
          </div>

          <div className="flex-1 min-h-0 w-full">
            <DynamicTableSalesReport
              data={tableData}
              showProfit={showProfit && isAdmin}
            />
          </div>

          {/* AI Insights Section */}
          {showAiInsights && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              <AiInsights
                data={aiInsights}
                isLoading={isLoadingAi}
                onAnalyze={runAiAnalysis}
              />
            </motion.div>
          )}

          {/* Share + AI Buttons */}
          {!showAiInsights && (
            <div className="space-y-2 mt-4">
              <ReportShareButton targetRef={reportRef} filename={`sales-report-${startDate}`} />
              <motion.button
                onClick={runAiAnalysis}
                className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:shadow-lg transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Запустить AI-анализ
              </motion.button>
            </div>
          )}
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
      className="app-page w-full px-4 sm:px-6 py-6 bg-background text-foreground flex flex-col items-center"
      style={{
        paddingTop: "calc(var(--app-top-clearance) + 0.5rem)",
        paddingBottom: "calc(var(--app-bottom-clearance) + 0.5rem)",
      }}
    >
      <motion.h1
        className="text-xl sm:text-2xl font-semibold mb-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Отчёт по продажам
      </motion.h1>
      <p className="text-sm text-muted-foreground mb-6">
        Выберите период, магазин и группы товаров
      </p>
      <motion.div
        className="bg-card rounded-2xl shadow-sm p-4 sm:p-6 w-full max-w-3xl space-y-4 border border-border"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="grid grid-cols-3 gap-2">
          <button
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                dateMode === "today"
                ? "border-blue-600 bg-primary text-white"
                : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            }`}
            onClick={() => setDateMode("today")}
          >
            Сегодня
          </button>
          <button
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                dateMode === "yesterday"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground"
            }`}
            onClick={() => setDateMode("yesterday")}
          >
            Вчера
          </button>
          <Popover
            open={showPeriodPicker}
            onOpenChange={(open) => {
              setShowPeriodPicker(open);
              setIsDatePickerOpen(open);
              if (!open) {
                setTempPeriod(undefined);
              }
            }}
          >
            <PopoverTrigger asChild>
              <button
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  dateMode === "period"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground"
                }`}
                onClick={() => {
                  setDateMode("period");
                  setTempPeriod(period);
                  setShowPeriodPicker(true);
                  setIsDatePickerOpen(true);
                }}
              >
                Период
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={tempPeriod?.from ? tempPeriod : undefined}
                onSelect={setTempPeriod}
                numberOfMonths={1}
                disabled={(date) => date > new Date()}
                initialFocus
              />
              <div className="flex justify-end p-2">
                <button
                  className="px-3 py-1 rounded bg-primary text-primary-foreground"
                  disabled={!(tempPeriod?.from && tempPeriod?.to)}
                  onClick={() => {
                    setPeriod(tempPeriod);
                    setShowPeriodPicker(false);
                    setIsDatePickerOpen(false);
                  }}
                >
                  Применить
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {dateMode === "period" && period?.from && period?.to && (
          <div className="text-sm text-muted-foreground">
            {formatDate(period.from)} → {formatDate(period.to)}
          </div>
        )}
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
                ? "bg-primary hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
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
