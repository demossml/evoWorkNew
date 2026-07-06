import { useEffect, useState, useRef } from "react";
import type { DateRange } from "react-day-picker";
import { motion } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import { Calendar, Popover, PopoverContent, PopoverTrigger } from "../../components/ui";
import { useSalesSummaryReport, type ReportData } from "../../hooks/useSalesSummaryReport";
import { ReportHeader, ReportKPIBar, ReportShareButton } from "@shared/ui";

const formatMoney = (value: number) => {
  if (value == null || !Number.isFinite(value)) return "0 ₽";
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₽`;
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function SalesSummaryReport() {
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "period">(
    "today"
  );
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(undefined);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useTelegramBackButton();

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const now = new Date();
    if (dateMode === "today") {
      const today = formatLocalDate(now);
      setStartDate(today);
      setEndDate(today);
      return;
    }
    if (dateMode === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const y = formatLocalDate(yesterday);
      setStartDate(y);
      setEndDate(y);
      return;
    }
    if (dateMode !== "period") {
      setShowPeriodPicker(false);
      setTempPeriod(undefined);
    }
  }, [dateMode]);

  useEffect(() => {
    if (dateMode !== "period" || !period?.from || !period?.to) return;
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [dateMode, period]);

  const canRunReport = !!startDate && !!endDate;

  const loadReport = async () => {
    if (!canRunReport) {
      setError("Выберите период отчёта");
      return;
    }

    setLoading(true);
    setError(null);
    setReportData(null);
    try {
      const response = await client.api.evotor.salesGardenReport.$post({
        json: { startDate, endDate },
      });

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }
      const report: ReportData = await response.json();
      setReportData(report);
    } catch (err) {
      console.error(err);
      setError("Не удалось получить отчёт");
    } finally {
      setLoading(false);
    }
  };

  const analytics = useSalesSummaryReport(reportData);


  if (loading) {
    return (
      <div className="app-page flex min-h-[60vh] items-center justify-center">
        <div className="w-16 h-16 border-4 border-t-transparent border-primary border-solid rounded-full animate-spin" />
      </div>
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
      <ReportHeader
        title="Сводный финансовый отчёт"
        subtitle="Продажи, возвраты, выплаты и остаток наличных по магазинам"
      />

      {!reportData && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900/45 backdrop-blur-xl p-4 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setDateMode("today")}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                dateMode === "today"
                  ? "border-blue-600 bg-primary text-white"
                  : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              Сегодня
            </button>
            <button
              onClick={() => setDateMode("yesterday")}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                dateMode === "yesterday"
                  ? "border-blue-600 bg-primary text-white"
                  : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              Вчера
            </button>
            <Popover
              open={showPeriodPicker}
              onOpenChange={(open) => {
                setShowPeriodPicker(open);
                if (!open) {
                  setTempPeriod(undefined);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    dateMode === "period"
                      ? "border-blue-600 bg-primary text-white"
                      : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  }`}
                  onClick={() => {
                    setDateMode("period");
                    setTempPeriod(period);
                    setShowPeriodPicker(true);
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
                <div className="flex items-center justify-end gap-2 p-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    className="px-3 py-1 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                    onClick={() => {
                      setTempPeriod(period);
                      setShowPeriodPicker(false);
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    className="px-3 py-1 rounded bg-primary text-white disabled:bg-gray-400"
                    disabled={!(tempPeriod?.from && tempPeriod?.to)}
                    onClick={() => {
                      setPeriod(tempPeriod);
                      setShowPeriodPicker(false);
                    }}
                  >
                    Применить
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {dateMode === "period" && period?.from && period?.to && (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {formatDate(period.from)} → {formatDate(period.to)}
            </div>
          )}
          <button
            onClick={loadReport}
            className={`w-full py-3 rounded-xl font-medium text-white transition ${
              canRunReport
                ? "bg-primary hover:bg-primary/90 dark:bg-blue-500 dark:hover:bg-primary"
                : "bg-muted cursor-not-allowed"
            }`}
            disabled={!canRunReport}
          >
            Сгенерировать отчёт
          </button>
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
      )}

      {reportData && analytics && (
        <div ref={reportRef}>
          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900/45 backdrop-blur-xl p-4 space-y-2">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Период: {reportData.startDate} - {reportData.endDate}
            </p>
            <ReportKPIBar items={[
              { label: "Продажи", value: formatMoney(reportData.grandTotalSell || 0) },
              { label: "Возвраты", value: formatMoney(reportData.grandTotaRefund || 0) },
              { label: "Выплаты", value: formatMoney(reportData.grandTotaCashOutcome || 0) },
              { label: "Нетто", value: formatMoney(analytics.netTotal), emphasis: "primary" },
            ]} />

            {analytics.hasConsistencyIssue ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                Проверка данных: есть расхождения между итогами и детализацией.
                Продажи Δ {analytics.diffSell.toFixed(2)}, возвраты Δ{" "}
                {analytics.diffRefund.toFixed(2)}, выплаты Δ{" "}
                {analytics.diffPayouts.toFixed(2)}.
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
                Проверка данных: итоги совпадают с детализацией по магазинам.
              </div>
            )}

            <button
              onClick={() => {
                setReportData(null);
                setError(null);
              }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              Сформировать новый отчёт
            </button>
          </div>

          <div className="space-y-3">
            {analytics.shops.map((shop) => (
              <div
                key={shop.shopName}
                className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900/45 backdrop-blur-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{shop.shopName}</h3>
                  <span className="text-sm text-gray-600 dark:text-slate-300">
                    Нетто: {formatMoney(shop.netRevenue)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-gray-50 dark:bg-slate-800/70 p-2 text-gray-600 dark:text-slate-300">
                    Продажи: <span className="text-gray-900 dark:text-white">{formatMoney(shop.totalSell)}</span>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-slate-800/70 p-2 text-gray-600 dark:text-slate-300">
                    Возвраты: <span className="text-gray-900 dark:text-white">{formatMoney(shop.refunds)}</span>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-slate-800/70 p-2 text-gray-600 dark:text-slate-300">
                    Выплаты: <span className="text-gray-900 dark:text-white">{formatMoney(shop.payouts)}</span>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-slate-800/70 p-2 text-gray-600 dark:text-slate-300">
                    Нал. в кассе (текущий остаток): <span className="text-gray-900 dark:text-white">{formatMoney(shop.cashBalance)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900/45 backdrop-blur-xl p-4 text-sm text-gray-600 dark:text-slate-300">
            Наличные по всем магазинам:{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(analytics.cashTotal)}</span>
          </div>
          <ReportShareButton targetRef={reportRef} filename={`sales-summary-${reportData?.startDate || "report"}`} />
        </div>
      )}
    </motion.div>
  );
}
