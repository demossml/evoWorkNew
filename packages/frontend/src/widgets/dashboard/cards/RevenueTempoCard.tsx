import { useEffect, useMemo, useState } from "react";
import { Clock3, TrendingUp } from "lucide-react";
import {
  fetchRevenueHourlyPlanFact,
  type HourlyPlanFactResponse,
  type HourlyPlanFactRow,
} from "@features/dashboard/api";
import type { SalesData } from "../type";
import type { AccessoriesSalesData } from "../../../hooks/dashboard/useAccessoriesSales";
import {
  DEFAULT_ACCESSORY_SHARE_TARGET_PCT,
  getAccessoryShareTargetPct,
  getTempoSettingsChangedEventName,
} from "../../../config/tempoSettings";

type RevenueTempoCardProps = {
  salesDeltaPct: number;
  onClick: () => void;
  pace?: { fact: number; plan: number; rate: number; projected: number; remain: number; status: string };
};

type RevenueTempoDetailsProps = {
  since?: string;
  currentData: SalesData;
  previousData: SalesData | null;
  accessoriesData?: AccessoriesSalesData | null;
  formatCurrency?: (amount: number) => string;
};

type ShopTempoMetrics = {
  grossSales: number;
  netRevenue: number;
  totalChecks: number;
  averageCheck: number;
  refundRate: number;
};

const pctChange = (current: number, previous: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const calcShopMetrics = (data: SalesData, shopName: string): ShopTempoMetrics => {
  if (shopName === "all") {
    const refundRate =
      data.grandTotalSell > 0 ? (data.grandTotalRefund / data.grandTotalSell) * 100 : 0;
    return {
      grossSales: data.grandTotalSell,
      netRevenue: data.netRevenue,
      totalChecks: data.totalChecks,
      averageCheck: data.averageCheck,
      refundRate,
    };
  }

  const shop = data.salesDataByShopName[shopName];
  if (!shop) {
    return { grossSales: 0, netRevenue: 0, totalChecks: 0, averageCheck: 0, refundRate: 0 };
  }
  const refund = Object.values(shop.refund).reduce((sum, value) => sum + value, 0);
  const netRevenue = shop.totalSell - refund;
  const totalChecks = Number(shop.checksCount || 0);
  return {
    grossSales: shop.totalSell,
    netRevenue,
    totalChecks,
    averageCheck: totalChecks > 0 ? netRevenue / totalChecks : 0,
    refundRate: shop.totalSell > 0 ? (refund / shop.totalSell) * 100 : 0,
  };
};

export function RevenueTempoCard({ salesDeltaPct, onClick, pace }: RevenueTempoCardProps) {
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 text-white p-4 shadow-lg relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-90">Темп продаж</span>
        <Clock3 className="w-5 h-5 opacity-80" />
      </div>
      {pace ? (
        <>
          <div className="text-2xl font-bold">{fmt(pace.fact)} ₽</div>
          <div className="h-1.5 bg-white/20 rounded-full mt-1.5 mb-2 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${
              pace.status === "ahead" ? "bg-emerald-400" :
              pace.status === "behind" ? "bg-red-400" : "bg-amber-400"
            }`} style={{ width: `${Math.min(pace.plan > 0 ? (pace.fact / pace.plan) * 100 : 0, 100)}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs opacity-80">
            <span>План: {fmt(pace.plan)} ₽</span>
            <span>Прогноз: {fmt(pace.projected)} ₽</span>
            <span>Темп: {fmt(pace.rate)} ₽/ч</span>
            <span>Ост: {Math.floor(pace.remain)}ч{Math.round((pace.remain%1)*60)}м</span>
          </div>
        </>
      ) : (
        <>
          <div className="text-2xl font-bold">
            {salesDeltaPct >= 0 ? "+" : ""}
            {salesDeltaPct.toFixed(1)}%
          </div>
          <div className="text-xs opacity-75 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>к прошлому периоду</span>
          </div>
        </>
      )}
    </div>
  );
}

export function RevenueTempoDetails({
  since,
  currentData,
  previousData,
  accessoriesData,
  formatCurrency = (amount) =>
    new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount),
}: RevenueTempoDetailsProps) {
  const [shopFilter, setShopFilter] = useState<string>("all");
  const [hourlyRows, setHourlyRows] = useState<HourlyPlanFactRow[]>([]);
  const [totalPlan, setTotalPlan] = useState(0);
  const [actualNet, setActualNet] = useState(0);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  const [hourlyViewMode, setHourlyViewMode] = useState<"cumulative" | "hourly">(
    "cumulative"
  );
  const [tempoViewMode, setTempoViewMode] = useState<"summary" | "hours" | "detail">(
    "summary"
  );
  const [showGapSeries, setShowGapSeries] = useState(false);
  const [showAccessoriesSeries, setShowAccessoriesSeries] = useState(false);
  const [accessoryShareTargetPct, setAccessoryShareTargetPct] = useState(
    DEFAULT_ACCESSORY_SHARE_TARGET_PCT
  );

  const shopNames = useMemo(
    () => Object.keys(currentData.salesDataByShopName).sort((a, b) => a.localeCompare(b)),
    [currentData.salesDataByShopName]
  );

  useEffect(() => {
    if (shopFilter !== "all" && !shopNames.includes(shopFilter)) {
      setShopFilter("all");
    }
  }, [shopNames, shopFilter]);

  useEffect(() => {
    const refresh = () => setAccessoryShareTargetPct(getAccessoryShareTargetPct());
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "tempo.accessoryShareTargetPct") return;
      refresh();
    };
    const customEventName = getTempoSettingsChangedEventName();
    window.addEventListener("storage", onStorage);
    window.addEventListener(customEventName, refresh as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(customEventName, refresh as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!since) return;
    let cancelled = false;

    const loadHourly = async () => {
      setHourlyLoading(true);
      setHourlyError(null);
      try {
        const json = (await fetchRevenueHourlyPlanFact({
          date: since,
          shopName: shopFilter === "all" ? undefined : shopFilter,
        })) as HourlyPlanFactResponse;
        if (!cancelled) {
          setHourlyRows(Array.isArray(json.rows) ? json.rows : []);
          setTotalPlan(Number(json.totalPlan || 0));
          setActualNet(Number(json.actualNet || 0));
        }
      } catch (error) {
        if (!cancelled) {
          setHourlyError(
            error instanceof Error ? error.message : "Ошибка загрузки плана-факта по часам"
          );
        }
      } finally {
        if (!cancelled) setHourlyLoading(false);
      }
    };

    void loadHourly();
    return () => {
      cancelled = true;
    };
  }, [since, shopFilter]);

  const current = calcShopMetrics(currentData, shopFilter);
  const previous = previousData ? calcShopMetrics(previousData, shopFilter) : current;
  const salesDeltaPct = pctChange(current.netRevenue, previous.netRevenue);
  const checksDeltaPct = pctChange(current.totalChecks, previous.totalChecks);
  const avgCheckDeltaPct = pctChange(current.averageCheck, previous.averageCheck);
  const refundDeltaPp = current.refundRate - previous.refundRate;

  const reasonCandidates = [
    {
      reason: "Падение трафика (меньше чеков)",
      score: Math.max(0, -checksDeltaPct),
    },
    {
      reason: "Просадка среднего чека",
      score: Math.max(0, -avgCheckDeltaPct),
    },
    {
      reason: "Рост возвратов",
      score: Math.max(0, refundDeltaPp * 2),
    },
  ];
  const mainReason =
    salesDeltaPct >= 0
      ? "Просадки нет, динамика стабильная или положительная."
      : reasonCandidates.sort((a, b) => b.score - a.score)[0].reason;

  const displayRows = useMemo(() => {
    if (hourlyViewMode === "cumulative") {
      return hourlyRows.map((row) => ({
        ...row,
        actualDisplay: row.actualCumulative,
        accessoriesDisplay: Number(row.accessoriesCumulative || 0),
        expectedDisplay: row.expectedCumulative,
        gapDisplay: row.gap,
      }));
    }
    let prevExpected = 0;
    return hourlyRows.map((row) => {
      const expectedHourly = row.expectedCumulative - prevExpected;
      prevExpected = row.expectedCumulative;
      return {
        ...row,
        actualDisplay: row.actualHourly,
        accessoriesDisplay: Number(row.accessoriesHourly || 0),
        expectedDisplay: expectedHourly,
        gapDisplay: row.actualHourly - expectedHourly,
      };
    });
  }, [hourlyRows, hourlyViewMode]);

  const maxDisplayValue =
    displayRows.length > 0
      ? Math.max(
          ...displayRows.map((row) => Math.max(row.actualDisplay, row.expectedDisplay, 0)),
          1
        )
      : 1;
  const maxDisplayGapAbsValue =
    displayRows.length > 0
      ? Math.max(...displayRows.map((row) => Math.abs(row.gapDisplay)), 1)
      : 1;

  const accessoriesRevenue = useMemo(() => {
    if (!accessoriesData) return 0;
    if (shopFilter === "all") {
      return accessoriesData.total.reduce((sum, item) => sum + Number(item.sum || 0), 0);
    }
    const byShop = accessoriesData.byShop.find((shop) => shop.shopName === shopFilter);
    return byShop
      ? byShop.sales.reduce((sum, item) => sum + Number(item.sum || 0), 0)
      : 0;
  }, [accessoriesData, shopFilter]);
  const accessoriesSharePct =
    current.grossSales > 0 ? (accessoriesRevenue / current.grossSales) * 100 : 0;
  const accessoriesIsOnTarget = accessoriesSharePct >= accessoryShareTargetPct;

  const accessoriesShareByShop = useMemo(() => {
    const rows = Object.entries(currentData.salesDataByShopName).map(([shopName, shop]) => {
      const grossSales = Number(shop.totalSell || 0);
      const accessories = accessoriesData?.byShop.find((item) => item.shopName === shopName);
      const accessoriesSum =
        accessories?.sales.reduce((sum, item) => sum + Number(item.sum || 0), 0) || 0;
      const sharePct = grossSales > 0 ? (accessoriesSum / grossSales) * 100 : 0;
      const isOnTarget = sharePct >= accessoryShareTargetPct;
      return {
        shopName,
        accessoriesSum,
        grossSales,
        sharePct,
        isOnTarget,
      };
    });
    return rows.sort((a, b) => b.sharePct - a.sharePct);
  }, [currentData.salesDataByShopName, accessoriesData, accessoryShareTargetPct]);

  const displayRowsWithAccessories = useMemo(
    () =>
      displayRows.map((row) => {
        const accessoriesEstimated = Math.max(0, Number(row.accessoriesDisplay || 0));
        const accessoriesTarget = Math.max(
          0,
          row.actualDisplay * (accessoryShareTargetPct / 100)
        );
        const accessoriesRowSharePct =
          row.actualDisplay > 0 ? (accessoriesEstimated / row.actualDisplay) * 100 : 0;
        return {
          ...row,
          accessoriesEstimated,
          accessoriesTarget,
          accessoriesRowSharePct,
        };
      }),
    [displayRows, accessoryShareTargetPct]
  );
  const maxAccessoryDisplayValue =
    displayRowsWithAccessories.length > 0
      ? Math.max(...displayRowsWithAccessories.map((row) => row.accessoriesEstimated), 1)
      : 1;
  const criticalMinGapRow =
    displayRowsWithAccessories.length > 0
      ? [...displayRowsWithAccessories].sort((a, b) => a.gapDisplay - b.gapDisplay)[0]
      : null;
  const criticalMaxGapRow =
    displayRowsWithAccessories.length > 0
      ? [...displayRowsWithAccessories].sort((a, b) => b.gapDisplay - a.gapDisplay)[0]
      : null;
  const shortRows = useMemo(() => {
    const latest = displayRowsWithAccessories.slice(-3);
    const byHour = new Map<number, (typeof displayRowsWithAccessories)[number]>();
    for (const row of latest) byHour.set(row.hour, row);
    if (criticalMinGapRow) byHour.set(criticalMinGapRow.hour, criticalMinGapRow);
    return Array.from(byHour.values()).sort((a, b) => a.hour - b.hour);
  }, [displayRowsWithAccessories, criticalMinGapRow]);
  const focusGapValue = displayRowsWithAccessories.length
    ? displayRowsWithAccessories[displayRowsWithAccessories.length - 1].gapDisplay
    : 0;

  return (
    <div className="mt-3 space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Сравнение с прошлым периодом
          </div>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            value={shopFilter}
            onChange={(event) => setShopFilter(event.target.value)}
          >
            <option value="all">Все магазины</option>
            {shopNames.map((shopName) => (
              <option key={shopName} value={shopName}>
                {shopName}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded bg-gray-50 p-2 dark:bg-gray-700">
            <div className="text-gray-500">Net выручка</div>
            <div className="font-semibold">
              {salesDeltaPct >= 0 ? "+" : ""}
              {salesDeltaPct.toFixed(1)}%
            </div>
          </div>
          <div className="rounded bg-gray-50 p-2 dark:bg-gray-700">
            <div className="text-gray-500">Чеки</div>
            <div className="font-semibold">
              {checksDeltaPct >= 0 ? "+" : ""}
              {checksDeltaPct.toFixed(1)}%
            </div>
          </div>
          <div className="rounded bg-gray-50 p-2 dark:bg-gray-700">
            <div className="text-gray-500">Средний чек</div>
            <div className="font-semibold">
              {avgCheckDeltaPct >= 0 ? "+" : ""}
              {avgCheckDeltaPct.toFixed(1)}%
            </div>
          </div>
          <div className="rounded bg-gray-50 p-2 dark:bg-gray-700">
            <div className="text-gray-500">Δ возвратов</div>
            <div className="font-semibold">
              {refundDeltaPp >= 0 ? "+" : ""}
              {refundDeltaPp.toFixed(1)} п.п.
            </div>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">Причина: {mainReason}</div>
        <div className="mt-3 rounded bg-indigo-50 p-2 text-xs dark:bg-indigo-900/30">
          <div className="font-semibold text-indigo-800 dark:text-indigo-200">
            Высокомаржинальные аксессуары
          </div>
          <div className="mt-1 text-indigo-700 dark:text-indigo-300">
            Продажи: {formatCurrency(accessoriesRevenue)} ₽
          </div>
          <div className="text-indigo-700 dark:text-indigo-300">
            Доля в общей массе продаж: {accessoriesSharePct.toFixed(1)}%
          </div>
          <div className="text-indigo-700 dark:text-indigo-300">
            Цель: {accessoryShareTargetPct}% •{" "}
            <span
              className={
                accessoriesIsOnTarget
                  ? "font-semibold text-emerald-700 dark:text-emerald-300"
                  : "font-semibold text-red-700 dark:text-red-300"
              }
            >
              {accessoriesIsOnTarget ? "в норме" : "ниже цели"}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {(shopFilter === "all"
              ? accessoriesShareByShop
              : accessoriesShareByShop.filter((row) => row.shopName === shopFilter)
            ).map((row) => (
              <div
                key={row.shopName}
                className="flex items-center justify-between rounded bg-white/70 px-2 py-1 dark:bg-gray-900/40"
              >
                <span className="truncate text-indigo-900 dark:text-indigo-100">
                  {row.shopName}
                </span>
                <span
                  className={
                    row.isOnTarget
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-red-700 dark:text-red-300"
                  }
                >
                  {row.sharePct.toFixed(1)}% • {row.isOnTarget ? "в норме" : "ниже цели"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            План-факт по часам
          </div>
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-xs dark:border-gray-600 dark:bg-gray-700">
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                tempoViewMode === "summary"
                  ? "bg-slate-700 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
              onClick={() => setTempoViewMode("summary")}
            >
              Кратко
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                tempoViewMode === "hours"
                  ? "bg-slate-700 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
              onClick={() => setTempoViewMode("hours")}
            >
              Часы
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                tempoViewMode === "detail"
                  ? "bg-slate-700 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
              onClick={() => setTempoViewMode("detail")}
            >
              Детально
            </button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-xs dark:border-gray-600 dark:bg-gray-700">
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                hourlyViewMode === "cumulative"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
              onClick={() => setHourlyViewMode("cumulative")}
            >
              Кумулятивный
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                hourlyViewMode === "hourly"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
              onClick={() => setHourlyViewMode("hourly")}
            >
              Почасовой
            </button>
          </div>
          <button
            type="button"
            className={`rounded border px-2 py-1 text-xs ${
              showGapSeries
                ? "border-red-400 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200"
                : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
            }`}
            onClick={() => setShowGapSeries((prev) => !prev)}
          >
            Показать Gap
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-1 text-xs ${
              showAccessoriesSeries
                ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-200"
                : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
            }`}
            onClick={() => setShowAccessoriesSeries((prev) => !prev)}
          >
            Показать аксессуары
          </button>
        </div>
        {hourlyLoading && <div className="text-xs text-gray-500">Загрузка...</div>}
        {hourlyError && <div className="text-xs text-red-500">{hourlyError}</div>}
        {!hourlyLoading && !hourlyError && hourlyRows.length === 0 && (
          <div className="text-xs text-gray-500">Нет данных за выбранную дату.</div>
        )}
        {!hourlyLoading && !hourlyError && hourlyRows.length > 0 && tempoViewMode === "summary" && (
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded bg-blue-50 p-2 dark:bg-blue-900/30">
              <div className="text-gray-500">Факт</div>
              <div className="font-semibold">{formatCurrency(actualNet)} ₽</div>
            </div>
            <div className="rounded bg-slate-100 p-2 dark:bg-slate-800/70">
              <div className="text-slate-600 dark:text-slate-300">План общий</div>
              <div className="font-semibold">{formatCurrency(totalPlan)} ₽</div>
            </div>
            <div className="rounded bg-gray-50 p-2 dark:bg-gray-700">
              <div className="text-gray-500">Gap</div>
              <div className={focusGapValue < 0 ? "font-semibold text-red-600" : "font-semibold text-green-600"}>
                {focusGapValue >= 0 ? "+" : ""}
                {formatCurrency(focusGapValue)} ₽
              </div>
            </div>
            <div className="rounded bg-fuchsia-50 p-2 dark:bg-fuchsia-900/30">
              <div className="text-fuchsia-700 dark:text-fuchsia-300">Аксессуары (доля)</div>
              <div
                className={
                  accessoriesIsOnTarget
                    ? "font-semibold text-emerald-600"
                    : "font-semibold text-red-600"
                }
              >
                {accessoriesSharePct.toFixed(1)}%
              </div>
            </div>
          </div>
        )}
        {!hourlyLoading &&
          !hourlyError &&
          hourlyRows.length > 0 &&
          (tempoViewMode === "hours" || tempoViewMode === "detail") && (
          <div className="space-y-3">
            <div className="rounded bg-gray-50 p-2 dark:bg-gray-700">
              <div className="mb-2 flex items-center gap-4 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Факт {hourlyViewMode === "cumulative" ? "(кумулятивно)" : "(по часу)"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  План общий {hourlyViewMode === "cumulative" ? "(ожидание)" : "(по часу)"}
                </span>
                {showGapSeries && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    Gap
                  </span>
                )}
                {showAccessoriesSeries && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-fuchsia-500" />
                    Аксессуары факт
                  </span>
                )}
              </div>
              <div className="flex items-end gap-1 overflow-x-auto pb-1">
                {displayRowsWithAccessories.map((row) => {
                  const actualHeight = Math.max(2, (row.actualDisplay / maxDisplayValue) * 68);
                  const expectedHeight = Math.max(
                    2,
                    (row.expectedDisplay / maxDisplayValue) * 68
                  );
                  const accessoriesHeight = Math.max(
                    2,
                    (row.accessoriesEstimated / maxAccessoryDisplayValue) * 56
                  );
                  const gapHeight = Math.max(
                    2,
                    (Math.abs(row.gapDisplay) / maxDisplayGapAbsValue) * 40
                  );
                  return (
                    <div key={row.hour} className="flex min-w-[26px] flex-col items-center gap-1">
                      <div className="flex h-[76px] items-end gap-[2px]">
                        <div
                          className="w-[6px] rounded-t bg-gray-400"
                          style={{ height: `${expectedHeight}px` }}
                          title={`${row.label} план: ${formatCurrency(row.expectedDisplay)} ₽`}
                        />
                        <div
                          className="w-[6px] rounded-t bg-blue-500"
                          style={{ height: `${actualHeight}px` }}
                          title={`${row.label} факт: ${formatCurrency(row.actualDisplay)} ₽`}
                        />
                        {showAccessoriesSeries && (
                          <div
                            className="w-[5px] rounded-t bg-fuchsia-500"
                            style={{ height: `${accessoriesHeight}px` }}
                            title={`${row.label} аксессуары: ${formatCurrency(
                              row.accessoriesEstimated
                            )} ₽`}
                          />
                        )}
                        {showGapSeries && (
                          <div
                            className={`w-[4px] rounded-t ${
                              row.gapDisplay < 0 ? "bg-red-500" : "bg-green-500"
                            }`}
                            style={{ height: `${gapHeight}px` }}
                            title={`${row.label} gap: ${row.gapDisplay >= 0 ? "+" : ""}${formatCurrency(
                              row.gapDisplay
                            )} ₽`}
                          />
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {criticalMinGapRow?.hour === row.hour || criticalMaxGapRow?.hour === row.hour
                          ? row.hour
                          : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <div className="grid grid-cols-6 gap-2 border-b border-gray-200 pb-1 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <div>Час</div>
                <div className="text-blue-600 dark:text-blue-300">Факт</div>
                <div className="text-slate-600 dark:text-slate-300">План общий</div>
                <div className="text-fuchsia-600 dark:text-fuchsia-300">Акс.</div>
                <div className="text-fuchsia-600 dark:text-fuchsia-300">Доля акс.</div>
                <div className="text-red-600 dark:text-red-300">Gap</div>
              </div>
              {(tempoViewMode === "hours" ? shortRows : displayRowsWithAccessories).map((row) => (
                <div key={`row-${row.hour}`} className="grid grid-cols-6 gap-2 text-xs">
                  <div className="text-gray-500">{row.label}</div>
                  <div className="text-blue-700 dark:text-blue-300">{formatCurrency(row.actualDisplay)} ₽</div>
                  <div className="text-slate-700 dark:text-slate-300">{formatCurrency(row.expectedDisplay)} ₽</div>
                  <div className="text-fuchsia-600 dark:text-fuchsia-300">
                    {formatCurrency(row.accessoriesEstimated)} ₽
                  </div>
                  <div
                    className={
                      row.accessoriesRowSharePct >= accessoryShareTargetPct
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-red-600 dark:text-red-300"
                    }
                  >
                    {row.accessoriesRowSharePct.toFixed(1)}%
                  </div>
                  <div className={row.gapDisplay < 0 ? "text-red-600" : "text-green-600"}>
                    {row.gapDisplay >= 0 ? "+" : ""}
                    {formatCurrency(row.gapDisplay)} ₽
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
