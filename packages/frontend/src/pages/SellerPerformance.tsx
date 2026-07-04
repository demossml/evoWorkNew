import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronUp, ArrowLeft, TrendingUp, TrendingDown,
  Store, AlertTriangle, Zap, Target, BarChart3,
  Calendar, ShoppingBag, Users, DollarSign, CheckCircle, XCircle,
  ArrowUpDown, Info, HelpCircle, BookOpen, Download,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import {
  type SellerMetrics,
  type StoreBaseline,
  type DowData,
} from "@/hooks/dashboard/useSellerEffectiveness";
import { useSellerEffectiveness } from "@/hooks/dashboard/useSellerEffectiveness";
import { ReportKPIBar, ReportShareButton } from "@shared/ui";

// ====== Helpers ======

function fmtRub(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ₽`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k ₽`;
  return `${Math.round(n)} ₽`;
}

function trendArrow(dir: "↑" | "↓" | "→"): { icon: JSX.Element; color: string } {
  if (dir === "↑") return { icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-500" };
  if (dir === "↓") return { icon: <TrendingDown className="w-4 h-4" />, color: "text-red-500" };
  return { icon: <span className="text-lg">→</span>, color: "text-gray-400" };
}

function riskBadge(level: "ok" | "warn" | "critical") {
  if (level === "critical") return { label: "КРИТ", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: <AlertTriangle className="w-3 h-3" /> };
  if (level === "warn") return { label: "ВНИМ", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: <Info className="w-3 h-3" /> };
  return { label: "OK", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: <CheckCircle className="w-3 h-3" /> };
}

// ====== Sub-components ======

function CriticalAlerts({ sellers }: { sellers: SellerMetrics[] }) {
  const active = sellers.filter(s => s.daysWorked >= 10);
  const critical = active.filter(s => s.trendSlope < -100 || s.cv > 40);
  if (critical.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-xl p-3 space-y-1.5"
    >
      <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-xs font-bold">Тревожные алерты</span>
        <span className="text-xs text-red-500 ml-auto">{critical.length} продавцов</span>
      </div>
      {critical.map(s => (
        <div key={s.uuid} className="text-xs text-red-600 dark:text-red-300 flex items-center gap-2 bg-red-100/60 dark:bg-red-800/30 rounded px-2 py-1">
          <span className="font-medium">{s.name.split(" ")[0]}</span>
          <span className="text-red-400">—</span>
          {s.trendSlope < -100 && <span>тренд {s.trendSlope} ₽/день</span>}
          {s.trendSlope < -100 && s.cv > 40 && <span>·</span>}
          {s.cv > 40 && <span>CV {s.cv}%</span>}
        </div>
      ))}
    </motion.div>
  );
}

function KpiCards({ snapshot, prevSnapshot }: { snapshot: any; prevSnapshot: any }) {
  const deltaRev = prevSnapshot && prevSnapshot.totalRevenue > 0
    ? Math.round((snapshot.totalRevenue - prevSnapshot.totalRevenue) / prevSnapshot.totalRevenue * 100)
    : null;
  const deltaCheck = prevSnapshot && prevSnapshot.avgCheck > 0
    ? snapshot.avgCheck - prevSnapshot.avgCheck
    : null;

  const cards = [
    { icon: <DollarSign className="w-5 h-5" />, label: "Общая выручка", value: fmtRub(snapshot.totalRevenue), color: "text-emerald-500",
      delta: deltaRev, deltaFmt: (d: number) => `${d > 0 ? "+" : ""}${d}%` },
    { icon: <BarChart3 className="w-5 h-5" />, label: "Средняя выручка/день", value: fmtRub(snapshot.avgDailyRev), color: "text-blue-500",
      delta: null },
    { icon: <ShoppingBag className="w-5 h-5" />, label: "Средний чек", value: `${snapshot.avgCheck} ₽`, color: "text-purple-500",
      delta: deltaCheck, deltaFmt: (d: number) => `${d > 0 ? "+" : ""}${d} ₽` },
    { icon: <Calendar className="w-5 h-5" />, label: "Всего смен", value: String(snapshot.totalShifts), color: "text-amber-500",
      delta: null },
    { icon: <Users className="w-5 h-5" />, label: "Активны сегодня", value: String(snapshot.activeToday), color: "text-cyan-500",
      delta: null },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <div className={`${c.color} mb-1`}>{c.icon}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{c.label}</div>
          <div className="text-base font-bold text-gray-800 dark:text-gray-100">{c.value}</div>
          {c.delta != null && (
            <div className={`text-xs font-medium mt-0.5 ${c.delta > 0 ? "text-emerald-500" : c.delta < 0 ? "text-red-500" : "text-gray-400"}`}>
              {c.delta > 0 ? "↑" : c.delta < 0 ? "↓" : "="} vs пред. период: {c.deltaFmt!(c.delta)}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function StoreComparison({ stores, onSelect, selected }: { stores: StoreBaseline[]; onSelect: (s: string) => void; selected: string }) {
  const maxRev = Math.max(...stores.map(s => s.avgDailyRev), 1);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {stores.map((s, i) => {
        const isActive = selected === s.store;
        return (
        <motion.div
          key={s.store}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          onClick={() => onSelect(isActive ? "all" : s.store)}
          className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border cursor-pointer hover:shadow-md transition-all active:scale-[0.98] ${
            isActive
              ? "border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/30"
              : "border-gray-100 dark:border-gray-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100">{s.store}</h3>
            <Store className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">{fmtRub(s.avgDailyRev)}</div>
          <div className="text-xs text-gray-500">средняя выручка/день</div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-gray-500">Чек <span className="font-medium text-gray-700 dark:text-gray-300">{s.avgCheck} ₽</span></span>
            <span className="text-gray-500">CV <span className={`font-medium ${s.cv > 30 ? "text-red-500" : "text-emerald-500"}`}>{s.cv}%</span></span>
          </div>
            <div className="mt-1.5 w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(s.avgDailyRev / maxRev * 100, 100)}%` }} />
          </div>
        </motion.div>
      )})}
    </div>
  );
}

function SellerTable({ sellers, filter, sortBy, onSort }: {
  sellers: SellerMetrics[];
  filter: string;
  sortBy: keyof SellerMetrics;
  onSort: (key: keyof SellerMetrics) => void;
}) {
  const filtered = useMemo(() => {
    if (filter === "all") return sellers;
    return sellers.filter(s => s.storeLabels.some(l => {
      if (filter === "Победа") return l === "П";
      if (filter === "Твардоского") return l === "Т";
      if (filter === "45") return l === "45";
      return false;
    }));
  }, [sellers, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortBy] ?? 0;
      const vb = b[sortBy] ?? 0;
      if (typeof va === "number" && typeof vb === "number") return vb - va;
      return 0;
    });
  }, [filtered, sortBy]);

  const headers: { key: keyof SellerMetrics; label: string }[] = [
    { key: "avgDailyRev", label: "₽/день" },
    { key: "avgCheck", label: "Чек" },
    { key: "cv", label: "CV%" },
    { key: "vapeShare", label: "Vape%" },
    { key: "efficiencyVsStore", label: "Эфф." },
  ];

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto -mx-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700">
            <th className="text-left p-2 text-gray-400 font-medium w-6">#</th>
            <th className="text-left p-2 text-gray-400 font-medium">Продавец</th>
            {headers.map(h => (
              <th
                key={h.key}
                onClick={() => onSort(h.key)}
                className="text-right p-2 text-gray-400 font-medium cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none"
              >
                <span className="inline-flex items-center gap-0.5">
                  {h.label}
                  {sortBy === h.key && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
            ))}
            <th className="text-right p-2 text-gray-400 font-medium">Тренд</th>
            <th className="text-center p-2 text-gray-400 font-medium">Δ</th>
            <th className="text-center p-2 text-gray-400 font-medium">Риск</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, idx) => {
            const t = trendArrow(s.trendDirection);
            // cv badge computed but not displayed in this view
            const risk = riskBadge(s.riskLevel);
            const isAdmin = s.uuid === "475039971";
            return (
              <motion.tr
                key={s.uuid}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`border-b border-gray-50 dark:border-gray-750 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${isAdmin ? "opacity-50" : ""}`}
              >
                <td className="p-2 text-gray-400">{idx + 1}</td>
                <td className="p-2">
                  <div className="font-medium text-gray-800 dark:text-gray-100">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.daysWorked}д · {s.storeLabels.join(", ")}</div>
                </td>
                <td className="p-2 text-right font-semibold text-gray-800 dark:text-gray-100">{fmtRub(s.avgDailyRev)}</td>
                <td className="p-2 text-right text-gray-700 dark:text-gray-200">{s.avgCheck} ₽</td>
                <td className="p-2 text-right">
                  <span className={`font-medium ${s.cv > 35 ? "text-red-500" : s.cv > 30 ? "text-amber-500" : "text-emerald-500"}`}>
                    {s.cv}%
                  </span>
                </td>
                <td className="p-2 text-right text-gray-600 dark:text-gray-300">{s.vapeShare}%</td>
                <td className="p-2 text-right">
                  <span className={`font-medium ${s.efficiencyVsStore >= 100 ? "text-emerald-500" : s.efficiencyVsStore >= 95 ? "text-amber-500" : "text-red-500"}`}>
                    {s.efficiencyVsStore > 0 ? `${s.efficiencyVsStore}%` : "—"}
                  </span>
                </td>
                <td className="p-2 text-right">
                  <span className={`inline-flex items-center gap-1 ${t.color}`}>
                    {t.icon}
                    <span className="text-xs">{s.trendSlope > 0 ? "+" : ""}{s.trendSlope}</span>
                  </span>
                </td>
                <td className="p-2 text-center">
                  {s.deltaRank != null ? (
                    <span className={`inline-flex items-center gap-0.5 font-semibold text-xs ${
                      s.deltaRank > 0 ? "text-emerald-500" : s.deltaRank < 0 ? "text-red-500" : "text-gray-400"
                    }`}>
                      {s.deltaRank > 0 ? <TrendingUp className="w-3 h-3" /> : s.deltaRank < 0 ? <TrendingDown className="w-3 h-3" /> : <span>→</span>}
                      {s.deltaRank > 0 ? "+" : ""}{s.deltaRank}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="p-2 text-center">
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${risk.cls}`}>
                    {risk.icon}{risk.label}
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Mobile: cards */}
    <div className="block sm:hidden space-y-2">
      {sorted.map((s, idx) => {
        const t = trendArrow(s.trendDirection);
        const risk = riskBadge(s.riskLevel);
        const isAdmin = s.uuid === "475039971";
        return (
          <motion.div
            key={s.uuid}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            className={`bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 ${isAdmin ? "opacity-50" : ""}`}
          >
            {/* Top row: rank + name + risk */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-400 w-6">#{idx + 1}</span>
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-100">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.daysWorked}д · {s.storeLabels.join(", ")}</div>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${risk.cls}`}>
                {risk.icon}{risk.label}
              </span>
            </div>

            {/* Main KPI: big revenue number */}
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-bold text-gray-800 dark:text-gray-100">{fmtRub(s.avgDailyRev)}</span>
              <span className="text-xs text-gray-400">₽/день</span>
              {s.deltaRank != null && (
                <span className={`ml-auto text-xs font-semibold ${
                  s.deltaRank > 0 ? "text-emerald-500" : s.deltaRank < 0 ? "text-red-500" : "text-gray-400"
                }`}>
                  {s.deltaRank > 0 ? "↑" : s.deltaRank < 0 ? "↓" : "="}{Math.abs(s.deltaRank)}
                </span>
              )}
            </div>

            {/* Metrics row */}
            <div className="flex gap-3 text-xs text-gray-600 dark:text-gray-300 flex-wrap">
              <span>Чек <b className="text-gray-800 dark:text-gray-100">{s.avgCheck} ₽</b></span>
              <span className={s.cv > 35 ? "text-red-500" : s.cv > 30 ? "text-amber-500" : "text-emerald-500"}>
                CV <b>{s.cv}%</b>
              </span>
              <span>Vape <b className="text-purple-500">{s.vapeShare}%</b></span>
              <span className={s.efficiencyVsStore >= 100 ? "text-emerald-500" : "text-gray-400"}>
                Эфф <b>{s.efficiencyVsStore > 0 ? `${s.efficiencyVsStore}%` : "—"}</b>
              </span>
              {s.rubPerHour != null && (
                <span>₽/ч <b className="text-gray-800 dark:text-gray-100">{fmtRub(s.rubPerHour)}</b></span>
              )}
            </div>

            {/* Trend row */}
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span className={`inline-flex items-center gap-1 ${t.color}`}>
                {t.icon}
                <span>{s.trendSlope > 0 ? "+" : ""}{s.trendSlope} ₽/д</span>
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  </>
  );
}

function SellerDetail({ seller, onClose }: { seller: SellerMetrics; onClose: () => void }) {
  const t = trendArrow(seller.trendDirection);
  // risk badge computed but not displayed in detail view
  const isAdmin = seller.uuid === "475039971";
  // Sparkline — real daily revenue from backend
  const sparkData = useMemo(() => {
    const raw = seller.dailyRevenue || [];
    if (raw.length === 0) return [];
    // Take last 30 days, format dates as ДД.ММ
    const recent = raw.slice(-30);
    return recent.map(d => {
      const parts = d.date.split("-");
      const label = parts.length === 3 ? `${parts[2]}.${parts[1]}` : d.date;
      return { day: label, value: d.value };
    });
  }, [seller]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25 }}
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl max-h-[85vh] w-full sm:max-w-lg overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-gray-800 dark:text-gray-100">{seller.name}</h2>
            <div className="text-xs text-gray-400">{seller.daysWorked} смен · {seller.totalChecks} чеков · {seller.storeLabels.join(", ")}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <ChevronDown className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
              <div className="text-xs text-gray-500">Выручка/день</div>
              <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{fmtRub(seller.avgDailyRev)}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
              <div className="text-xs text-gray-500">Средний чек</div>
              <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{seller.avgCheck} ₽</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
              <div className="text-xs text-gray-500">Чеков/день</div>
              <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{seller.checksPerDay}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
              <div className="text-xs text-gray-500">Эфф. vs магазин</div>
              <div className={`text-lg font-bold ${seller.efficiencyVsStore >= 100 ? "text-emerald-500" : "text-amber-500"}`}>
                {seller.efficiencyVsStore > 0 ? `${seller.efficiencyVsStore}%` : "—"}
              </div>
            </div>
            {seller.rubPerHour != null && (
              <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
                <div className="text-xs text-gray-500">₽/час</div>
                <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{fmtRub(seller.rubPerHour)}</div>
                <div className="text-[9px] text-gray-400">{seller.avgHours}ч/день</div>
              </div>
            )}
          </div>

          {/* Trend + CV + MAD */}
          <div className="flex gap-3 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">
              <span className={t.color}>{t.icon}</span>
              Тренд {seller.trendSlope > 0 ? "+" : ""}{seller.trendSlope} ₽/д (R²={seller.trendR2.toFixed(3)})
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">
              CV {seller.cv}% · MAD {seller.mad.toFixed(3)}
            </span>
          </div>

          {/* Rank delta */}
          {seller.deltaRank != null && (
            <div className={`rounded-lg p-3 border text-xs ${
              seller.deltaRank > 0 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" :
              seller.deltaRank < 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" :
              "bg-gray-50 dark:bg-gray-750 border-gray-200 dark:border-gray-700"
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-800 dark:text-gray-100">#{seller.rank}</span>
                <span className="text-gray-400">→</span>
                <span className={`font-semibold ${
                  seller.deltaRank > 0 ? "text-emerald-600" : seller.deltaRank < 0 ? "text-red-600" : "text-gray-500"
                }`}>
                  {seller.deltaRank > 0 ? "↑" : seller.deltaRank < 0 ? "↓" : "="}
                  {Math.abs(seller.deltaRank)} поз.
                </span>
                <span className="text-gray-400 ml-auto">
                  было #{seller.prevRank} · {seller.prevAvgDailyRev ? `${Math.round(seller.prevAvgDailyRev / 1000)}k ₽/д` : "—"}
                </span>
              </div>
            </div>
          )}

          {/* KPI targets */}
          <div>
            <div className="text-xs text-gray-500 mb-2">KPI цели</div>
            {/* Avg Check target */}
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-500">Средний чек</span>
                <span className="font-medium text-gray-700 dark:text-gray-200">{seller.avgCheck} / {seller.targetAvgCheck} ₽</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${seller.avgCheck >= seller.targetAvgCheck ? "bg-emerald-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(seller.avgCheck / seller.targetAvgCheck * 100, 100)}%` }}
                />
              </div>
              <div className="text-[9px] text-right mt-0.5 text-gray-400">
                {Math.round(seller.avgCheck / seller.targetAvgCheck * 100)}%
              </div>
            </div>
            {/* Vape Share target */}
            <div>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-500">Vape-доля</span>
                <span className="font-medium text-gray-700 dark:text-gray-200">{seller.vapeShare} / {seller.targetVapeShare}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${seller.vapeShare >= seller.targetVapeShare ? "bg-emerald-500" : "bg-purple-500"}`}
                  style={{ width: `${Math.min(seller.vapeShare / seller.targetVapeShare * 100, 100)}%` }}
                />
              </div>
              <div className="text-[9px] text-right mt-0.5 text-gray-400">
                {Math.round(seller.vapeShare / seller.targetVapeShare * 100)}%
              </div>
            </div>
          </div>

          {/* What-if calculator */}
          {seller.checksPerDay > 0 && (() => {
            const deltas = [50, 100, 150, 200];
            const steps = deltas.map(d => {
              const newCheck = seller.avgCheck + d;
              const newDailyRev = Math.round(seller.checksPerDay * newCheck);
              const gain = newDailyRev - seller.avgDailyRev;
              // Find new rank by comparing with all sellers
              return { delta: d, newCheck, newDailyRev, gain };
            });
            return (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1">
                  <Target className="w-3 h-3" />Что если чек выше?
                </div>
                <div className="space-y-1">
                  {steps.map(s => (
                    <div key={s.delta} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">+{s.delta} ₽ → чек {s.newCheck} ₽</span>
                      <span className="font-semibold text-emerald-600">
                        +{fmtRub(s.gain)}/день
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Category breakdown */}
          {seller.categoryBreakdown && seller.categoryBreakdown.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Категории</div>
              <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                {seller.categoryBreakdown.map((cat, i) => {
                  const colors = ["#8b5cf6", "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"];
                  return (
                    <div
                      key={i}
                      className="h-full transition-all"
                      style={{ width: `${cat.share}%`, backgroundColor: colors[i % colors.length], minWidth: cat.share > 0 ? "2px" : 0 }}
                      title={`${cat.name}: ${cat.share}%`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs">
                {seller.categoryBreakdown.map((cat, i) => {
                  const colors = ["#8b5cf6", "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"];
                  return (
                    <span key={i} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                      <span className="text-gray-600 dark:text-gray-300">{cat.name} {cat.share}%</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sparkline chart */}
          {sparkData.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Динамика (последние {sparkData.length} дн.)</div>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis dataKey="day" tick={false} />
                    <YAxis tick={false} width={0} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(17,24,39,0.9)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "#f8fafc",
                      }}
                      formatter={(value: number) => [`${fmtRub(value)}`, "Выручка"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={seller.riskLevel === "critical" ? "#ef4444" : seller.riskLevel === "warn" ? "#f59e0b" : "#3b82f6"}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Histogram of daily revenue */}
          {sparkData.length >= 5 && (() => {
            const revs = sparkData.map(d => d.value).filter(v => v > 0);
            const min = Math.min(...revs);
            const max = Math.max(...revs);
            const bucketCount = Math.min(8, Math.max(4, Math.ceil(revs.length / 5)));
            const bucketWidth = (max - min) / bucketCount || 1000;
            const buckets = Array.from({ length: bucketCount }, (_, i) => ({
              label: `${Math.round((min + i * bucketWidth) / 1000)}-${Math.round((min + (i + 1) * bucketWidth) / 1000)}k`,
              count: revs.filter(v => v >= min + i * bucketWidth && (i === bucketCount - 1 ? v <= max : v < min + (i + 1) * bucketWidth)).length,
            }));
            const maxCount = Math.max(...buckets.map(b => b.count), 1);
            return (
              <div>
                <div className="text-xs text-gray-500 mb-1">Распределение дневной выручки</div>
                <div className="flex gap-0.5 h-14 items-end">
                  {buckets.map((b, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <span className="text-[8px] text-gray-400">{b.count}</span>
                      <div className="w-full flex-1 flex flex-col justify-end">
                        <div
                          className="w-full rounded-t bg-blue-400/60"
                          style={{ height: `${Math.max(4, (b.count / maxCount) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[7px] text-gray-400 leading-tight text-center">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Store breakdown */}
          <div>
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Store className="w-3 h-3" />По магазинам</div>
            <div className="space-y-1">
              {seller.stores.map(st => {
                const sBaseline = ([] as any[]).find(b => b.store === st.store);
                const eff = sBaseline ? Math.round(st.avgDailyRev / sBaseline.avgDailyRev * 100) : null;
                return (
                  <div key={st.store} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-50 dark:bg-gray-750">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-200">{st.store}</span>
                      <span className="text-gray-400 ml-2">{st.days}д</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-800 dark:text-gray-100">{fmtRub(st.avgDailyRev)}</div>
                      {eff !== null && (
                        <div className={`text-xs ${eff >= 100 ? "text-emerald-500" : eff >= 95 ? "text-amber-500" : "text-red-500"}`}>
                          {eff}% от среднего
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DOW mini-chart */}
          {Object.keys(seller.dow).length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Средняя выручка по дням недели</div>
              <div className="flex gap-0.5 h-16 items-end">
                {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((label, i) => {
                  const val = seller.dow[String(i)] || 0;
                  const maxVal = Math.max(...Object.values(seller.dow), 1);
                  const pct = Math.max(2, (val / maxVal) * 100);
                  const isWeekend = i === 0 || i === 6;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-gray-400">{Math.round(val / 1000)}k</span>
                      <div className="w-full flex-1 flex flex-col justify-end">
                        <div
                          className={`w-full rounded-t ${isWeekend ? "bg-amber-400/60" : "bg-blue-500/60"}`}
                          style={{ height: `${pct}%`, minHeight: 2 }}
                        />
                      </div>
                      <span className={`text-[9px] ${isWeekend ? "text-amber-500" : "text-gray-400"}`}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Risk reasons */}
          {seller.riskReasons.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />Факторы риска
              </div>
              {seller.riskReasons.map((r, i) => (
                <div key={i} className="text-xs text-red-600 dark:text-red-300 flex items-start gap-1">
                  <span>•</span><span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3 text-xs text-gray-500">
              ⚠️ Исключён из общего рейтинга — всего {seller.daysWorked} смен. Требуется минимум 20 смен для статистической значимости.
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Charts({ sellers, dowData }: { sellers: SellerMetrics[]; dowData: DowData[] }) {
  // Revenue by seller bar chart
  const barData = sellers.filter(s => s.uuid !== "475039971").map(s => ({
    name: s.name.split(" ")[0],
    revenue: s.avgDailyRev,
    cv: s.cv,
    fill: s.riskLevel === "critical" ? "#ef4444" : s.riskLevel === "warn" ? "#f59e0b" : "#3b82f6",
  }));

  // DOW labels
  const dowLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const maxDow = Math.max(...dowData.flatMap(d => [0,1,2,3,4,5,6].map(dow => d[dow as keyof typeof d] as number)), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Bar: CV vs Avg Check */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />Выручка/день по продавцам
        </h4>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={fmtRub} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} width={80} />
              <Tooltip
                contentStyle={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11, color: "#f8fafc" }}
                formatter={(value: number) => [fmtRub(value), "Выручка/день"]}
              />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DOW heatmap */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />Выручка по дням недели (heatmap)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left p-1 text-gray-400 font-medium w-20"></th>
                {dowLabels.map(d => (
                  <th key={d} className={`text-center p-1 font-medium ${d === "Сб" || d === "Вс" ? "text-amber-500" : "text-gray-400"}`}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dowData.map(d => {
                return (
                  <tr key={d.store} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="p-1 font-medium text-gray-700 dark:text-gray-200">{d.store}</td>
                    {[0,1,2,3,4,5,6].map(dow => {
                      const val = d[dow as keyof typeof d] as number;
                      const intensity = val / maxDow;
                      const isWeekend = dow === 0 || dow === 6;
                      // Color: blue for weekday, amber for weekend, intensity 0..1
                      const r = isWeekend ? Math.round(245 + (251-245)*intensity) : Math.round(239 - 180*intensity);
                      const g = isWeekend ? Math.round(158 - 100*intensity) : Math.round(246 - 170*intensity);
                      const b = isWeekend ? Math.round(11 + (146-11)*intensity) : Math.round(252 - 160*intensity);
                      return (
                        <td
                          key={dow}
                          className="p-1 text-center rounded font-medium"
                          style={{ backgroundColor: `rgb(${r},${g},${b})`, color: intensity > 0.5 ? '#fff' : '#374151' }}
                        >
                          {Math.round(val/1000)}k
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-2 text-[9px] text-gray-400">
          <span>Меньше</span>
          <div className="flex h-2 rounded-full overflow-hidden">
            {[0, 0.25, 0.5, 0.75, 1].map(i => {
              const r2 = Math.round(239 - 180*i), g2 = Math.round(246 - 170*i), b2 = Math.round(252 - 160*i);
              return <div key={i} className="w-4 h-2" style={{ backgroundColor: `rgb(${r2},${g2},${b2})` }} />;
            })}
          </div>
          <span>Больше</span>
        </div>
      </div>
    </div>
  );
}

function Insights({ sellers }: { sellers: SellerMetrics[] }) {
  const atRisk = sellers.filter(s => s.riskLevel === "critical" || s.riskLevel === "warn");
  const [expanded, setExpanded] = useState<string | null>(null);

  const detailedAnalysis: Record<string, { diagnosis: string; causes: string[]; actions: string[] }> = {
    "ВАЛЯ Валентина": {
      diagnosis: "Системный спад эффективности. Продавец теряет −93 ₽ выручки каждый день — за 90 дней это −8 370 ₽ недополученной выручки. При сохранении тренда через 2 месяца выйдет на 21 000 ₽/день (−19%).",
      causes: [
        "Самый низкий средний чек (318 ₽) — не работает с дорогими позициями. Разница с лучшим чеком (Сухорукова 393 ₽) = 75 ₽ с каждой покупки.",
        "Низкая vape-доля (15.7%) — не продаёт основной ассортимент. При средней vape-доле по сети 20.5% недополучает ~5% выручки.",
        "Высокий поток (81 чек/день) при низком чеке — «конвейер» из дешёвых продаж вместо качественных.",
        "MAD 0.234 — выше среднего. Нестабильность не от выбросов, а системная.",
      ],
      actions: [
        "Тренинг по upselling: к каждой одноразке предлагать вторую со скидкой 10% или премиум-версию (+200–400 ₽ к чеку). Для pod-систем — допродажа жидкости. Цель: поднять чек до 350 ₽ за 2 недели.",
        "Работа с витриной вейпов: выучить топ-10 позиций, их цены и преимущества. Сейчас vape-доля 15.7% при сетевой 20.5%.",
        "Наставничество: 2 смены в паре с Александрой (чек 367 ₽, лидер сети).",
        "KPI на месяц: средний чек ≥ 340 ₽, vape-доля ≥ 18%. При недостижении — повторный цикл.",
      ],
    },
    "Федорова Карина": {
      diagnosis: "Хаотичная производительность — самая высокая волатильность в сети (CV 36.3%). В «хорошие» дни делает 30 000+ ₽, в «плохие» — 12 000 ₽. Разница в 2.5× между днями означает, что проблема не в продавце как таковом, а во внешних факторах: день недели, магазин, часы смены.",
      causes: [
        "CV 36.3% + MAD 0.281 — оба показателя худшие. Это системная нестабильность, а не единичные выбросы.",
        "Работает в двух магазинах: Победа (34 смены, CV 38.4%) и Твардоского (16 смен, CV 31.5%). На Победе волатильность выше.",
        "Эффективность vs магазин 92% — стабильно ниже baseline. Даже в «хорошие» дни не дотягивает до среднего по точке.",
        "Тренд −46 ₽/день (R²=0.022) — слабый, но отрицательный. Медленное сползание.",
      ],
      actions: [
        "Адресный анализ: разбить 50 смен по дням недели и часам. Найти паттерн: в какие дни/часы провалы?",
        "Проверить график: возможно, Федорова получает «плохие» смены (выходные, вечерние часы спада).",
        "Ограничить одной точкой (Победа) на месяц — исключить фактор смены магазина. Сравнить CV до и после.",
        "KPI: снизить CV до ≤30% за счёт стабилизации графика. Целевой чек ≥ 350 ₽.",
      ],
    },
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
        <Zap className="w-4 h-4 text-amber-500" />Insights & Alerts
      </h3>

      {atRisk.map(s => {
        const isExpanded = expanded === s.uuid;
        const detail = detailedAnalysis[s.name];

        return (
        <motion.div
          key={s.uuid}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className={`rounded-xl border ${
            s.riskLevel === "critical"
              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
              : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
          } overflow-hidden`}
        >
          {/* Header */}
          <div className="p-3">
            <div className="flex items-start gap-2">
              {s.riskLevel === "critical"
                ? <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                : <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              }
              <div className="min-w-0 flex-1">
                <div className={`text-xs font-semibold ${s.riskLevel === "critical" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {s.name}
                </div>
                {s.riskReasons.map((r, i) => (
                  <div key={i} className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{r}</div>
                ))}
              </div>
            </div>

            {/* Подробнее button */}
            {detail && (
              <button
                onClick={() => setExpanded(isExpanded ? null : s.uuid)}
                className="mt-2 w-full text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/60 dark:bg-gray-800/40 border border-gray-200/50 dark:border-gray-700/50 transition-colors"
              >
                {isExpanded ? (
                  <><ChevronUp className="w-3 h-3" />Свернуть</>
                ) : (
                  <><ChevronDown className="w-3 h-3" />Подробнее: диагноз, причины и план действий</>
                )}
              </button>
            )}
          </div>

          {/* Expanded detail */}
          <AnimatePresence>
            {isExpanded && detail && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-red-200/50 dark:border-red-800/50"
              >
                <div className="p-3 space-y-3 bg-white/40 dark:bg-gray-900/20">
                  {/* Diagnosis */}
                  <div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Диагноз</div>
                    <div className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{detail.diagnosis}</div>
                  </div>

                  {/* Causes */}
                  <div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Причины</div>
                    <div className="space-y-1">
                      {detail.causes.map((c, i) => (
                        <div key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                          <span className="text-red-400 mt-0.5 shrink-0">•</span>
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">План действий</div>
                    <div className="space-y-1">
                      {detail.actions.map((a, i) => (
                        <div key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                          <span className="text-emerald-500 font-bold mt-0.5 shrink-0">{i + 1}.</span>
                          <span>{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        );
      })}

      {/* Weekend alert */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">Спад в выходные: −40%</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              Победа и Твардоского теряют 40% выручки в Сб–Вс. Рекомендуется: промо-акции на выходные, сменное расписание под трафик.
            </div>
          </div>
        </div>
      </div>

      {/* H3 confirmed */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Гипотезы H1, H3 — подтверждены</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              Store fixed effects значимы. Выходные — структурный фактор. H5 опровергнута: продавец влияет на чек сильнее локации.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== HELP MODAL ======

function HelpModal({ onClose }: { onClose: () => void }) {
  const sections = [
    {
      title: "₽/день — Средняя дневная выручка",
      content: "SUM(close_sum) / количество смен продавца за период. Это главный показатель производительности. НЕ нормализован по часам — продавец с 4-часовой сменой будет иметь заниженный показатель.",
      action: "Сравнивать продавцов из одной точки. Для сравнения между точками — использовать «Эффективность vs магазин».",
    },
    {
      title: "Чек — Средний чек",
      content: "Общая выручка / количество чеков. Показывает качество продаж: насколько дорогие покупки совершает покупатель у этого продавца.",
      action: "Чек < 340 ₽ — тренинг по upselling (допродажа второй одноразки/премиум-версии; жидкость — только к pod-системам). Чек > 380 ₽ — эталон (Сухорукова 393 ₽).",
    },
    {
      title: "Тренд (slope) — наклон линейной регрессии",
      content: "slope(daily_revenue ~ day_index). Показывает, растёт или падает выручка со временем. > +50 ₽/день = рост, < −50 = спад, иначе стабильно. R² показывает, насколько уверенно мы можем говорить о тренде (чем ближе к 1, тем надёжнее).",
      action: "↘ спад + R² > 0.03 → срочное внимание. → стабильно + R² < 0.01 → тренда нет, нормально.",
    },
    {
      title: "CV% — Коэффициент вариации (волатильность)",
      content: "(STDDEV / MEAN) × 100 по дням, исключая дни без смен. Показывает, насколько «ровно» работает продавец. CV < 25% = стабильный, 25–35% = умеренный, > 35% = волатильный. В отличие от исходного исследования, здесь ИСКЛЮЧЕНЫ дни без смен (нулевые дни не занижают среднее).",
      action: "Высокий CV → проверить: разные дни недели? Разные магазины? Сменный график? Часы пик/спад?",
    },
    {
      title: "MAD-стабильность",
      content: "median(|x − median(x)|) / median(x). Альтернатива CV, устойчивая к выбросам. Чем ближе к 0, тем стабильнее. Используется как дополнительная проверка: если CV высокий, а MAD низкий → проблема в отдельных выбросах, а не в общей нестабильности.",
      action: "MAD > 0.25 → высокая нестабильность. Сравнить CV и MAD: если оба высокие — системная проблема. Если CV высокий, MAD низкий — единичные выбросы.",
    },
    {
      title: "Vape% — Доля вейпов в выручке",
      content: "Доля выручки от продажи вейпов (одноразки, жидкости) среди всех позиций с известной категорией (commodity_uuid). Позиции без категории ИСКЛЮЧЕНЫ. Это важно: до 01.05.2026 категории не заполнены, поэтому цифры могут быть смещены.",
      action: "Низкая vape-доля → продавец не работает с основным ассортиментом. Высокая vape-доля (25%+) → продавец-специалист по вейпам. Не коррелирует с CV (H2 опровергнута).",
    },
    {
      title: "Эффективность vs магазин (Store Fixed Effects)",
      content: "Средняя дневная выручка продавца / средняя дневная выручка магазина × 100%. Нормирует производительность на baseline точки. 100% = работает на уровне среднего по магазину. > 100% = лучше среднего. < 95% = хуже среднего.",
      action: "Главный показатель для сравнения продавцов из РАЗНЫХ магазинов. Александра (107%) — эталон. Федорова (92%) — ниже baseline своей точки.",
    },
    {
      title: "Риск-уровни (OK / ВНИМ / КРИТ)",
      content: "Автоматическая классификация на основе комбинации факторов. КРИТ: нисходящий тренд + низкий чек + высокая волатильность. ВНИМ: один-два фактора риска. OK: все показатели в норме.",
      action: "КРИТ → срочная интервенция (тренинг, наставник). ВНИМ → мониторинг и адресная работа. OK → поощрение, использование как эталона.",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25 }}
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl max-h-[85vh] w-full sm:max-w-lg overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <div>
              <h2 className="font-bold text-gray-800 dark:text-gray-100">Как читать дашборд</h2>
              <div className="text-xs text-gray-400">Методология исследования v2.1</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <ChevronDown className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {sections.map((s, i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
              <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-100 mb-1.5">{s.title}</h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-1.5 leading-relaxed">{s.content}</p>
              <div className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-1">
                <span className="mt-0.5">→</span>
                <span>{s.action}</span>
              </div>
            </div>
          ))}

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">📐 Источники данных</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              DuckDB: evotor.duckdb (30 091 продаж). Таблицы: sells, employees, positions, product_groups, vape_groups.
              Период: 04.03.2026 – 03.06.2026 (90 дней). Покрытие open_user_uuid: 99.4%.
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ====== MAIN PAGE ======

type SortKey = keyof SellerMetrics;

export default function SellerPerformancePage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(90);
  const [storeFilter, setStoreFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("avgDailyRev");
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleExportCSV = () => {
    const headers = ["Продавец", "Магазины", "Смен", "₽/день", "Чек", "CV%", "Vape%", "Эфф%", "Тренд", "Δ", "Риск"];
    const rows = activeSellers.map(s => [
      s.name,
      s.storeLabels.join(" "),
      String(s.daysWorked),
      String(s.avgDailyRev),
      String(s.avgCheck),
      String(s.cv),
      String(s.vapeShare),
      s.efficiencyVsStore > 0 ? String(s.efficiencyVsStore) : "—",
      `${s.trendSlope > 0 ? "+" : ""}${s.trendSlope}`,
      s.deltaRank != null ? (s.deltaRank > 0 ? `+${s.deltaRank}` : String(s.deltaRank)) : "—",
      s.riskLevel === "critical" ? "КРИТ" : s.riskLevel === "warn" ? "ВНИМ" : "OK",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seller-performance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { data, isLoading: _isLoading } = useSellerEffectiveness({ period, store: storeFilter });

  const sellers = data?.sellers ?? [];
  const baselines = data?.baselines ?? [];
  const snapshot = data?.snapshot ?? { totalRevenue: 0, avgDailyRev: 0, avgCheck: 0, totalShifts: 0, activeToday: 0 };
  const prevSnapshot = data?.prevSnapshot ?? null;
  const dowData = data?.dowData ?? [];
  const hypotheses = data?.hypotheses ?? [];

  const pageRef = useRef<HTMLDivElement>(null);

  const activeSellers = sellers.filter(s => {
    if (s.daysWorked < 10) return false;
    if (storeFilter === "all") return true;
    if (storeFilter === "Победа") return s.storeLabels.includes("П");
    if (storeFilter === "Твардоского") return s.storeLabels.includes("Т");
    if (storeFilter === "45") return s.storeLabels.includes("45");
    return true;
  });

  const selected = sellers.find(s => s.uuid === selectedSeller) || null;

  const kpiItems = [
    { label: "Общая выручка", value: fmtRub(snapshot.totalRevenue), variant: "green" as const },
    { label: "Ср. выручка/день", value: fmtRub(snapshot.avgDailyRev), variant: "blue" as const },
    { label: "Средний чек", value: `${snapshot.avgCheck} ₽`, variant: "purple" as const },
    { label: "Всего смен", value: String(snapshot.totalShifts), variant: "amber" as const },
    { label: "Активны сегодня", value: String(snapshot.activeToday), variant: "gray" as const },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <div className="shrink-0 min-w-0">
              <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">Эффективность</h1>
              <div className="text-xs text-gray-400">v3 · {period}д</div>
            </div>

            <div className="ml-auto flex gap-1 flex-wrap justify-end">
              <button
                onClick={() => setShowHelp(true)}
                className="px-2.5 py-1 text-xs rounded-md font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />Справка
              </button>
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1 text-xs rounded-md font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />CSV
              </button>
              {[30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setPeriod(d)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    period === d
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-650"
                  }`}
                >
                  {d}д
                </button>
              ))}
              <button
                onClick={() => setShowCharts(!showCharts)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1 ${
                  showCharts
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                <BarChart3 className="w-3 h-3" />Графики
              </button>
            </div>
          </div>

          {/* Store filter pills */}
          <div className="flex gap-1.5 mt-2">
            {["all", "Победа", "Твардоского", "45"].map(f => (
              <button
                key={f}
                onClick={() => setStoreFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                  storeFilter === f
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-650"
                }`}
              >
                {f === "all" ? "Все" : f}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-400 self-center">
              {activeSellers.length} продавцов
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={pageRef} className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4 max-w-5xl mx-auto w-full pb-24">
        {/* Critical Alerts */}
        <CriticalAlerts sellers={sellers} />

        {/* KPI Cards */}
        <ReportKPIBar items={kpiItems} />

        {/* Store Comparison */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" />Сравнение магазинов
          </h3>
          <StoreComparison stores={baselines} onSelect={setStoreFilter} selected={storeFilter} />
        </div>

        {/* Charts toggle */}
        <AnimatePresence>
          {showCharts && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Charts sellers={activeSellers} dowData={dowData} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Seller Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />Рейтинг продавцов
            </h3>
            <button
              onClick={() => setSortBy("avgDailyRev")}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
            >
              <ArrowUpDown className="w-3 h-3" />Сбросить сортировку
            </button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <SellerTable sellers={activeSellers} filter={storeFilter} sortBy={sortBy} onSort={setSortBy} />
          </div>
          {/* Efficiency footnote */}
          <div className="text-xs text-gray-400 mt-1.5 px-1">
            * Эффективность vs магазин = ₽/день продавца ÷ средняя ₽/день магазина × 100% (store fixed effects)
          </div>
        </div>

        {/* Hypotheses */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />Гипотезы исследования
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {hypotheses.map(h => (
              <div
                key={h.id}
                className={`rounded-lg p-2.5 border text-xs ${
                  h.confirmed
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {h.confirmed
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500" />
                  }
                  <span className={`font-semibold ${h.confirmed ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    {h.id}: {h.confirmed ? "Подтверждено" : "Не подтверждено"}
                  </span>
                </div>
                <div className="text-gray-600 dark:text-gray-400">{h.summary}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Insights & Alerts */}
        <Insights sellers={activeSellers} />

        <ReportShareButton targetRef={pageRef} filename="seller-performance" />
      </div>

      {/* Seller Detail Modal */}
      <AnimatePresence>
        {selected && (
          <SellerDetail seller={selected} onClose={() => setSelectedSeller(null)} />
        )}
      </AnimatePresence>

      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <HelpModal onClose={() => setShowHelp(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
