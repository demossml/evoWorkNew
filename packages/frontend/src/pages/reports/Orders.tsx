import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { motion } from "framer-motion";
import { useMe } from "../../hooks/useApi";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { Calendar, Popover, PopoverContent, PopoverTrigger } from "../../components/ui";
import { ErrorState, LoadingState } from "@shared/ui/states";
import { GroupSelector, OrderForecastCards } from "@widgets/reports";
import type { OrderV2Item } from "@widgets/reports/ui/OrderForecastCards";
import {
  fetchEvotorShops,
  fetchGroupsByShop,
  fetchOrderForecastV2,
  queryKeys,
} from "@shared/api";

interface GroupOption {
  name: string;
  uuid: string;
}

type OrderV2Response = {
  period: { startDate: string; endDate: string };
  assumptions: {
    forecastHorizonDays: number;
    leadTimeDays: number;
    serviceLevel: number;
  };
  summary: {
    totalOrderCost: number;
    skuCount: number;
    constrainedByBudget: boolean;
  };
  items: Array<{
    productUuid: string;
    productName: string;
    abcClass: "A" | "B" | "C";
    xyzClass: "X" | "Y" | "Z";
    currentStock: number;
    availableStock: number;
    avgDailyDemand: number;
    demandStdDev: number;
    safetyStock: number;
    reorderPoint: number;
    targetStock: number;
    recommendedOrderRaw: number;
    recommendedOrderRounded: number;
    unitCost: number;
    orderCost: number;
    expectedCoverageDays: number;
    confidence: number;
    reasonCodes: string[];
  }>;
};

export default function Orders() {
  const queryClient = useQueryClient();
  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [analysisWeeks, setAnalysisWeeks] = useState<number>(4);
  const [tableData, setTableData] = useState<OrderV2Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(undefined);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  useTelegramBackButton({ show: true });

  const { data } = useMe();
  const userId = data?.id?.toString() || "";

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const formatCompactDate = (date: string) =>
    new Date(date).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
    });

  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoadingShops(true);
      setError(null);
      try {
        const result = await queryClient.fetchQuery({
          queryKey: queryKeys.reports.sales.shops(userId),
          queryFn: () => fetchEvotorShops(userId),
          staleTime: 5 * 60_000,
        });
        setShopOptions(result.shopOptions);

        const shopUuids = Object.keys(result.shopOptions);
        if (shopUuids.length > 0) {
          setSelectedShops(shopUuids); // Select all by default
          await fetchGroupsForShop(shopUuids[0]);
        }
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить список магазинов");
      } finally {
        setIsLoadingShops(false);
      }
    };

    if (userId) {
      void fetchSalesData();
    }
  }, [queryClient, userId]);

  const fetchGroupsForShop = async (shopUuid: string) => {
    setIsLoadingGroups(true);
    setError(null);
    try {
      const result = await queryClient.fetchQuery({
        queryKey: queryKeys.reports.sales.groups(shopUuid),
        queryFn: () => fetchGroupsByShop(shopUuid),
        staleTime: 5 * 60_000,
      });

      if (!("groups" in result)) {
        throw new Error(result.message || "Не удалось загрузить группы");
      }
      setGroupOptions(result.groups || []);
      setSelectedGroups([]);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить группы для выбранного магазина");
    } finally {
      setIsLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (!period?.from || !period?.to) return;
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [period]);

  const toggleShop = (uuid: string) => {
    setSelectedShops((prev) =>
      prev.includes(uuid)
        ? prev.filter((s) => s !== uuid)
        : [...prev, uuid]
    );
  };

  const isFormValid =
    !!startDate &&
    !!endDate &&
    selectedShops.length > 0 &&
    selectedGroups.length > 0;

  const submitForecast = async () => {
    if (!isFormValid || !startDate || !endDate) {
      setError("Выберите период заказа, магазины и группы.");
      return;
    }

    setIsLoadingReport(true);
    setError(null);
    try {
      // Run forecasts for all selected shops in parallel
      const results = await Promise.all(
        selectedShops.map((shopUuid) =>
          fetchOrderForecastV2({
            startDate,
            endDate,
            shopUuid,
            groups: selectedGroups,
            analysisWeeks,
            leadTimeDays: 0,
            serviceLevel: 0.95,
          })
        )
      );

      // Merge all results into a flat array with shopName
      const shopName = (uuid: string) => shopOptions[uuid] || uuid;
      const allRows: OrderV2Item[] = [];

      for (let i = 0; i < results.length; i++) {
        const report = results[i] as OrderV2Response | { code: string; message: string };
        if (!("items" in report)) continue;
        const name = shopName(selectedShops[i]);
        for (const item of report.items) {
          allRows.push({
            productUuid: item.productUuid,
            productName: item.productName,
            shopName: name,
            abcClass: item.abcClass,
            xyzClass: item.xyzClass,
            currentStock: item.currentStock,
            avgDailyDemand: item.avgDailyDemand,
            recommendedOrderRounded: item.recommendedOrderRounded,
            orderCost: item.orderCost,
            confidence: item.confidence,
            reasonCodes: item.reasonCodes,
            demandStdDev: item.demandStdDev,
            safetyStock: item.safetyStock,
            reorderPoint: item.reorderPoint,
            targetStock: item.targetStock,
            unitCost: item.unitCost,
            expectedCoverageDays: item.expectedCoverageDays,
          });
        }
      }

      setTableData(allRows);
    } catch (err) {
      console.error(err);
      setError("Не удалось получить прогноз закупки");
    } finally {
      setIsLoadingReport(false);
    }
  };

  if (isLoadingReport) return <LoadingState />;
  if (error && !tableData) return <ErrorState error={error} />;

  if (!Object.keys(shopOptions).length && isLoadingShops) {
    return (
      <div className="app-page flex min-h-[60vh] items-center justify-center">
        <div className="w-16 h-16 border-4 border-t-transparent border-primary border-solid rounded-full animate-spin" />
      </div>
    );
  }

  if (tableData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="app-page w-full px-4 sm:px-6 py-6 flex flex-col gap-4"
        style={{
          paddingTop: "calc(var(--app-top-clearance) + 0.5rem)",
          paddingBottom: "calc(var(--app-bottom-clearance) + 0.75rem)",
        }}
      >
        <OrderForecastCards
          items={tableData}
          shops={shopOptions}
          selectedShopUuids={selectedShops}
          startDate={startDate!}
          endDate={endDate!}
          analysisWeeks={analysisWeeks}
          onNewForecast={() => {
            setTableData(null);
            setError(null);
          }}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="app-page w-full px-4 sm:px-6 py-6 flex flex-col gap-4"
      style={{
        paddingTop: "calc(var(--app-top-clearance) + 0.5rem)",
        paddingBottom: "calc(var(--app-bottom-clearance) + 0.75rem)",
      }}
    >
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Прогноз закупки
        </h1>
        <p className="mt-0.5 text-[13px] text-slate-400">
          Выберите период, магазины и группы
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-4">
        {/* Period picker */}
        <div>
          <div className="text-[11px] font-medium text-slate-400 mb-1.5">Период заказа</div>
          <Popover open={showPeriodPicker} onOpenChange={setShowPeriodPicker}>
            <PopoverTrigger asChild>
              <button className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[13px] font-semibold text-slate-900 active:bg-slate-50">
                {period?.from && period?.to
                  ? `${formatDate(period.from)} – ${formatDate(period.to)}`
                  : "Выберите период"}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-auto p-0 bg-white border border-slate-200"
            >
              <Calendar
                mode="range"
                selected={tempPeriod ?? period}
                onSelect={setTempPeriod}
                numberOfMonths={1}
                className="text-slate-900"
              />
              <div className="flex gap-2 p-3 border-t border-slate-200">
                <button
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-[13px] font-medium text-slate-500 active:bg-slate-50"
                  onClick={() => {
                    setTempPeriod(period);
                    setShowPeriodPicker(false);
                  }}
                >
                  Отмена
                </button>
                <button
                  className="flex-1 rounded-xl bg-primary py-2 text-[13px] font-semibold text-white active:bg-primary/80"
                  onClick={() => {
                    if (tempPeriod?.from && tempPeriod?.to) setPeriod(tempPeriod);
                    setShowPeriodPicker(false);
                  }}
                >
                  Применить
                </button>
              </div>
            </PopoverContent>
          </Popover>
          {startDate && endDate && (
            <p className="mt-1 text-[11px] text-slate-400">
              Товар в наличии с{" "}
              <span className="font-medium text-slate-600">
                {formatCompactDate(startDate)} по {formatCompactDate(endDate)}
              </span>
            </p>
          )}
        </div>

        {/* Shop multi-select */}
        <div>
          <div className="text-[11px] font-medium text-slate-400 mb-1.5">Магазины</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(shopOptions).map(([uuid, name]) => (
              <button
                key={uuid}
                type="button"
                onClick={() => toggleShop(uuid)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  selectedShops.includes(uuid)
                    ? "bg-primary text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 active:bg-slate-50"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Analysis weeks selector */}
        <div>
          <div className="text-[11px] font-medium text-slate-400 mb-1.5">Анализ за</div>
          <div className="flex gap-1.5">
            {[2, 3, 4, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAnalysisWeeks(n)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  analysisWeeks === n
                    ? "bg-primary text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 active:bg-slate-50"
                }`}
              >
                {n} нед.
              </button>
            ))}
          </div>
        </div>

        <GroupSelector
          groupOptions={groupOptions}
          selectedGroups={selectedGroups}
          setSelectedGroups={setSelectedGroups}
          isLoadingGroups={isLoadingGroups}
        />

        <button
          type="button"
          onClick={submitForecast}
          className={`rounded-xl py-2.5 text-[13px] font-semibold transition ${
            isFormValid
              ? "bg-primary text-white active:bg-primary/80"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
          disabled={!isFormValid}
        >
          Сгенерировать прогноз
        </button>

        <button
          type="button"
          onClick={() => setShowInstructions((prev) => !prev)}
          className="text-[12px] font-medium text-blue-600 active:text-blue-700"
        >
          {showInstructions ? "Скрыть инструкцию" : "Как работает прогноз?"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">
          {error}
        </div>
      )}

      {showInstructions && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[12px] text-slate-500 space-y-1.5">
          <p className="text-[13px] font-semibold text-slate-900">Как работает прогноз</p>
          <p>1. Выберите период, на который нужен товар (например, среда–пятница).</p>
          <p>2. Выберите магазины — можно все или несколько.</p>
          <p>3. Укажите, за сколько прошлых недель анализировать продажи.</p>
          <p>4. Система проанализирует продажи и рассчитает рекомендуемый заказ с учётом страхового запаса.</p>
        </div>
      )}
    </motion.div>
  );
}
