import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { useGetShops } from "../../hooks/useApi";
import { DynamicTableProfit } from "@widgets/reports";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { ReportHeader, ReportShareButton } from "@shared/ui";
import { client } from "../../helpers/api";

interface ReportData {
  byCategory: Record<string, number>;
  totalEvoExpenses: number;
  expenses1C: number;
  grossProfit: number;
  netProfit: number;
}

interface ProfitReport {
  period: { since: string; until: string };
  report: Record<string, ReportData>;
}

interface ProfitReportSnapshotListItem {
  id: number;
  createdAt: string;
  createdBy: string | null;
  since: string;
  until: string;
}

export default function ProfitReportPage() {
  const { data, isLoading, error } = useGetShops();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [formData, setFormData] = useState<
    Record<string, { expenses: number; grossProfit: number }>
  >({});
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [snapshotItems, setSnapshotItems] = useState<ProfitReportSnapshotListItem[]>(
    []
  );
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  useTelegramBackButton();

  const reportRef = useRef<HTMLDivElement>(null);

  const formatMonthFromIso = (isoDate: string) => {
    const m = isoDate.match(/^(\d{4})-(\d{2})-/);
    if (!m) return "";
    return `${m[2]}.${m[1]}`;
  };

  const getMonthRange = (month: string) => {
    if (!month) return null;
    const match = month.match(/^(\d{2})\.(\d{4})$/);
    if (!match) return null;

    const monthRaw = match[1];
    const yearRaw = match[2];
    const year = Number(yearRaw);
    const monthIndex = Number(monthRaw);
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthIndex) ||
      monthIndex < 1 ||
      monthIndex > 12
    ) {
      return null;
    }

    const since = `${yearRaw}-${monthRaw}-01`;
    const lastDay = new Date(year, monthIndex, 0).getDate();
    const until = `${yearRaw}-${monthRaw}-${String(lastDay).padStart(2, "0")}`;
    return { since, until };
  };

  const monthOptions = (() => {
    const now = new Date();
    const options: { value: string; label: string }[] = [];
    for (let i = 0; i < 24; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = String(d.getFullYear());
      const value = `${month}.${year}`;
      const label = `${month}.${year}`;
      options.push({ value, label });
    }
    return options;
  })();

  const loadSnapshots = async () => {
    setLoadingSnapshots(true);
    try {
      const response = await client.api.evotor["profit-report"].snapshots.$get({
        query: { limit: "20" },
      });
      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }
      const payload = await response.json();
      setSnapshotItems(payload.items || []);
    } catch (err) {
      console.error("Ошибка загрузки истории отчетов прибыли:", err);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    void loadSnapshots();
  }, []);

  const handleChange = (
    shopUuid: string,
    field: "expenses" | "grossProfit",
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [shopUuid]: {
        ...prev[shopUuid],
        [field]: Number(value) || 0,
      },
    }));
  };

  const handleSubmit = async () => {
    const monthRange = getMonthRange(selectedMonth);
    if (!monthRange) {
      alert("Выберите месяц");
      return;
    }

    setLoadingReport(true);
    try {
      const response = await client.api.evotor["profit-report"].$post({
        json: {
          shopUuids: data?.shopsNameAndUuid.map((shop) => shop.uuid) || [],
          since: monthRange.since,
          until: monthRange.until,
          dataFrom1C: formData,
        },
      });

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      const result = await response.json();
      setReport(result);
    } catch (err) {
      console.error("Ошибка при получении отчета:", err);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!report) return;
    setSavingSnapshot(true);
    try {
      const response = await client.api.evotor["profit-report"].snapshots.$post({
        json: {
          period: report.period,
          report: report.report,
        },
      });
      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }
      await loadSnapshots();
      alert("Отчёт сохранён в историю");
    } catch (err) {
      console.error("Ошибка сохранения отчета прибыли:", err);
      alert("Не удалось сохранить отчет");
    } finally {
      setSavingSnapshot(false);
    }
  };

  const handleLoadSnapshot = async (id: number) => {
    try {
      const response = await client.api.evotor["profit-report"].snapshots[
        ":id"
      ].$get({
        param: { id: String(id) },
      });
      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }
      const payload = await response.json();
      setReport(payload.payload);
      setSelectedMonth(formatMonthFromIso(payload.since));
    } catch (err) {
      console.error("Ошибка загрузки snapshot отчета:", err);
      alert("Не удалось загрузить отчет");
    }
  };

  const isFormValid =
    !!getMonthRange(selectedMonth) &&
    data?.shopsNameAndUuid.every((shop) => {
      const shopData = formData[shop.uuid];
      return (
        shopData !== undefined &&
        shopData.expenses !== undefined &&
        shopData.grossProfit !== undefined &&
        shopData.expenses !== null &&
        shopData.grossProfit !== null &&
        (shopData.expenses > 0 || shopData.grossProfit > 0)
      );
    });

  if (isLoading)
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100 dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-t-transparent border-blue-500 dark:border-blue-400 border-solid rounded-full animate-spin" />
      </div>
    );

  if (error)
    return (
      <p className="text-red-600 dark:text-red-400 text-center p-4">
        Ошибка загрузки магазинов: {error.message}
      </p>
    );

  return (
    <motion.div
      className="app-page-scroll p-4 bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <ReportHeader title="Отчёт по прибыли" />

      <div className="w-full mb-6 bg-white dark:bg-gray-800 rounded-md shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base">История отчетов</h2>
          <button
            type="button"
            onClick={() => void loadSnapshots()}
            className="text-sm px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700"
          >
            Обновить
          </button>
        </div>
        {loadingSnapshots ? (
          <div className="text-sm text-gray-500">Загрузка истории...</div>
        ) : snapshotItems.length === 0 ? (
          <div className="text-sm text-gray-500">История пока пустая</div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {snapshotItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void handleLoadSnapshot(item.id)}
                className="w-full text-left p-3 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="font-medium text-sm">
                  {formatMonthFromIso(item.since)} ({item.since} - {item.until})
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  #{item.id} • {new Date(item.createdAt).toLocaleString("ru-RU")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {!report && (
        <>
          {/* Фильтр по месяцу */}
          <div className="w-full mb-6">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-md shadow-sm">
              <label className="block text-sm font-medium mb-2">
                Месяц отчета
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Выберите месяц</option>
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Таблица ввода данных 1С */}
          <div className="w-full mb-8">
            <div className="space-y-4">
              {data?.shopsNameAndUuid.map((shop) => (
                <div
                  key={shop.uuid}
                  className="bg-white dark:bg-gray-800 p-4 rounded-md shadow-sm"
                >
                  <h3 className="font-semibold text-lg mb-2">{shop.name}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Расходы (1С)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData[shop.uuid]?.expenses ?? ""}
                        onChange={(e) =>
                          handleChange(shop.uuid, "expenses", e.target.value)
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Валовая прибыль (1С)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData[shop.uuid]?.grossProfit ?? ""}
                        onChange={(e) =>
                          handleChange(shop.uuid, "grossProfit", e.target.value)
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <motion.button
                onClick={handleSubmit}
                disabled={!isFormValid || loadingReport}
                className={`w-full p-3 rounded-md text-white mt-4 ${
                  !isFormValid || loadingReport
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500"
                } transition-colors duration-200 ease-in-out`}
                whileHover={{ scale: !isFormValid || loadingReport ? 1 : 1.04 }}
                whileTap={{ scale: !isFormValid || loadingReport ? 1 : 0.97 }}
              >
                {loadingReport ? "Формируем отчет..." : "Сформировать отчет"}
              </motion.button>
            </div>
          </div>
        </>
      )}

      {/* Если отчет сформирован — показываем только его */}
      {report && (
        <div ref={reportRef}>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => void handleSaveSnapshot()}
              disabled={savingSnapshot}
              className={`px-4 py-2 rounded-md text-white ${
                savingSnapshot
                  ? "bg-emerald-300 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              {savingSnapshot ? "Сохранение..." : "Сохранить отчет"}
            </button>
            <button
              type="button"
              onClick={() => setReport(null)}
              className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-700"
            >
              Новый расчет
            </button>
          </div>
          <DynamicTableProfit report={report} shops={data?.shopsNameAndUuid} />
          <ReportShareButton targetRef={reportRef} filename={`profit-report-${selectedMonth}`} />
        </div>
      )}

      {/* Добавь CSS для скрытия спиннеров */}
      <style>{`
        /* Chrome, Safari, Edge, Opera */
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        /* Firefox */
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </motion.div>
  );
}
