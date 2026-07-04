import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { ReportHeader } from "@shared/ui";
import { client } from "../../helpers/api";
import { LoadingState } from "@shared/ui/states/LoadingState";
import { ChevronDown } from "lucide-react";

const GREEN = "text-green-600 dark:text-green-400";
const RED = "text-red-600 dark:text-red-400";

function Delta({ value, unit = "%" }: { value: number; unit?: string }) {
  const sign = value > 0 ? "+" : "";
  const cls = value > 0 ? GREEN : value < 0 ? RED : "text-gray-500";
  return <span className={`text-sm font-semibold ${cls}`}>{sign}{value}{unit}</span>;
}

function formatRub(n: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

/** Mini sparkline bar — shows daily trend */
function Sparkline({ values, maxHeight = 32 }: { values: number[]; maxHeight?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[2px] h-8">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-[6px] bg-blue-500 dark:bg-blue-400 rounded-sm opacity-80"
          style={{ height: `${Math.max(3, (v / max) * maxHeight)}px` }}
        />
      ))}
    </div>
  );
}

export default function PeriodComparisonPage() {
  useTelegramBackButton();
  const [days, setDays] = useState(7);
  const [expanded, setExpanded] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);

  const { data, isLoading, error } = useQuery({
    queryKey: ["period-comparison", since, today],
    queryFn: async () => {
      const res = await (client.api as any)["period-comparison"].$post({ json: { since, until: today } });
      if (!res.ok) throw new Error("Ошибка");
      return res.json() as Promise<any>;
    },
    staleTime: 60000,
  });

  const toggle = (name: string) => setExpanded(expanded === name ? null : name);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <div className="text-red-500 text-center py-20">Ошибка загрузки</div>;

  const t = data.totals;
  const avgCheck = t.checks.current > 0 ? Math.round(t.revenue.current / t.checks.current) : 0;
  const prevAvgCheck = t.checks.previous > 0 ? Math.round(t.revenue.previous / t.checks.previous) : 0;
  const avgCheckChange = prevAvgCheck > 0 ? Math.round(((avgCheck - prevAvgCheck) / prevAvgCheck) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4">
        <ReportHeader title="Сравнение периодов" />
        <div className="flex gap-2 mt-3">
          {[
            { d: 1, label: "День" },
            { d: 7, label: "Неделя" },
            { d: 14, label: "2 нед" },
            { d: 30, label: "Месяц" },
          ].map(({ d, label }) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                days === d
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-500 mt-2">
          {data.period.since} — {data.period.until} vs {data.prevPeriod.since} — {data.prevPeriod.until}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3 px-4 py-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 text-center">
          <div className="text-xs text-gray-500 mb-1">Выручка</div>
          <div className="text-lg font-bold">{formatRub(t.revenue.current)}</div>
          <Delta value={t.revenue.change} />
          <div className="text-xs text-gray-400 mt-1">{formatRub(t.revenue.previous)} пред.</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 text-center">
          <div className="text-xs text-gray-500 mb-1">Чеки</div>
          <div className="text-lg font-bold">{t.checks.current} шт</div>
          <Delta value={t.checks.change} />
          <div className="text-xs text-gray-400 mt-1">{t.checks.previous} шт пред.</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 text-center">
          <div className="text-xs text-gray-500 mb-1">Средний чек</div>
          <div className="text-lg font-bold">{formatRub(avgCheck)}</div>
          <Delta value={avgCheckChange} />
          <div className="text-xs text-gray-400 mt-1">{formatRub(prevAvgCheck)} пред.</div>
        </div>
      </div>

      {/* Store tiles */}
      <div className="px-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">По магазинам</h2>
        {data.stores.map((store: any) => {
          const isOpen = expanded === store.name;
          const avgC = store.currentChecks > 0 ? Math.round(store.currentRevenue / store.currentChecks) : 0;
          const avgP = store.prevChecks > 0 ? Math.round(store.prevRevenue / store.prevChecks) : 0;
          return (
            <div
              key={store.name}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            >
              <button
                onClick={() => toggle(store.name)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{store.name}</div>
                  <div className="flex gap-3 mt-1 text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{formatRub(store.currentRevenue)}</span>
                    <Delta value={store.revenueChange} />
                  </div>
                </div>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </motion.div>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
                      <table className="w-full text-sm mt-3">
                        <thead>
                          <tr className="text-xs text-gray-500">
                            <th className="text-left font-medium pb-1">Показатель</th>
                            <th className="text-right font-medium pb-1">Текущий</th>
                            <th className="text-right font-medium pb-1">Предыдущий</th>
                            <th className="text-right font-medium pb-1">Δ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {[
                            ["Выручка", store.currentRevenue, store.prevRevenue, "rub"],
                            ["Чеки", store.currentChecks, store.prevChecks, "pcs"],
                            ["Средний чек", avgC, avgP, "rub"],
                          ].map(([label, cur, prev, unit]) => {
                            const c = Number(cur); const p = Number(prev);
                            const delta = p <= 0 ? 0 : Math.round(((c - p) / p) * 100);
                            const fmt = (v: number) => unit === "rub" ? (v > 100 ? formatRub(v) : String(v)) : `${v} шт`;
                            return (
                              <tr key={String(label)}>
                                <td className="py-2 text-gray-600 dark:text-gray-400">{label}</td>
                                <td className="py-2 text-right font-medium">
                                  {fmt(c)}
                                </td>
                                <td className="py-2 text-right text-gray-500">
                                  {fmt(p)}
                                </td>
                                <td className="py-2 text-right"><Delta value={delta} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Top products with daily trends */}
      {data.topProducts?.length > 0 && (
        <div className="px-4 pt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Топ товаров</h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
            {data.topProducts.map((p: any, i: number) => (
              <div key={p.productName} className="p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      <span className="text-gray-400 text-xs mr-1">#{i + 1}</span>
                      {p.productName}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {p.netQuantity} шт. · {formatRub(p.netRevenue)} · ср. {formatRub(p.averagePrice || 0)}
                    </div>
                  </div>
                  {p.dailyNetRevenue7?.length > 0 && (
                    <Sparkline values={p.dailyNetRevenue7} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
