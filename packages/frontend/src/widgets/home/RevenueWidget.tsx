import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useSalesCalculations } from "@/hooks/dashboard/useSalesCalculations";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { Sparkline } from "@shared/ui";
import { TileWrapper } from "./TileWrapper";
import { RevenueDetailsAdmin } from "@/widgets/dashboard/cards/RevenueDetailsAdmin";
import { RevenueDetailsUser } from "@/widgets/dashboard/cards/RevenueDetailsUser";
import { SkeletonCard } from "./widgetUtils";
import {
  DollarSign, TrendingUp, TrendingDown, Brain, Sparkles,
  Ticket, RotateCcw, Zap, Wrench, Package,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, ResponsiveContainer,
} from "recharts";

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

async function fetchPlanToday(): Promise<{ totalPlan: number; totalVapeSales: number }> {
  const resp = await fetch("/api/evotor/plan-for-today");
  if (!resp.ok) return { totalPlan: 0, totalVapeSales: 0 };
  const raw = await resp.json();
  let totalPlan = 0;
  let totalVapeSales = 0;
  for (const shop of Object.values(raw.salesData || {}) as any[]) {
    totalPlan += shop.datePlan || 0;
    totalVapeSales += shop.dataSales || 0;
  }
  return { totalPlan, totalVapeSales };
}

function getRecommendation(planPct: number, delta: number | null): {
  text: string; action: string; color: "green" | "yellow" | "red";
} {
  if (planPct >= 95) return { text: "План почти выполнен", action: delta && delta > 0 ? "Темп выше вчерашнего — удерживайте" : "Можно усилить допродажи", color: "green" };
  if (planPct >= 75) return { text: `Отставание ${100 - planPct}%`, action: "Рекомендуется акция на аксессуары", color: "yellow" };
  if (planPct >= 50) return { text: `Серьёзное отставание ${100 - planPct}%`, action: "Проверьте ассортимент и запустите промо", color: "yellow" };
  return { text: `Критическое отставание ${100 - planPct}%`, action: "Требуется план антикризисных мер", color: "red" };
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

const planColors = {
  green:  { bg: "bg-emerald-600", bar: "bg-emerald-400/60", badge: "bg-emerald-500/20 text-emerald-200" },
  yellow: { bg: "bg-amber-500",   bar: "bg-amber-300/60",   badge: "bg-amber-400/20 text-amber-100" },
  red:    { bg: "bg-red-600",     bar: "bg-red-400/60",     badge: "bg-red-500/20 text-red-200" },
} as const;

export function RevenueWidget({ since, until, expanded, onToggle }: Props) {
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const { data, loading, error } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);
  const { netSales } = useSalesCalculations(filtered);

  const { data: planData } = useQuery({
    queryKey: ["planForToday"],
    queryFn: fetchPlanToday,
    staleTime: 60_000,
    refetchInterval: 180_000,
  });

  const [showWhy, setShowWhy] = useState(false);

  if (loading || !filtered) return <SkeletonCard tone="blue" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;

  const totalPlan = planData?.totalPlan || 0;
  const totalVapeSales = planData?.totalVapeSales || 0;
  const planPct = totalPlan > 0 ? Math.round((totalVapeSales / totalPlan) * 100) : 0;
  const pctClamped = Math.min(planPct, 100);

  const trend7 = (filtered as any).dailySell
    ? Object.values((filtered as any).dailySell).slice(-7).map(Number)
    : [];

  const yesterday = trend7.length >= 2 ? trend7[trend7.length - 2] : null;
  const todayVal = trend7.length >= 1 ? trend7[trend7.length - 1] : null;
  const delta = yesterday && yesterday > 0 && todayVal
    ? Math.round(((todayVal - yesterday) / yesterday) * 100) : null;

  const rec = getRecommendation(planPct > 0 ? planPct : 100, delta);
  const colors = planColors[rec.color];

  // ══ Развёрнутый вид ══
  const detail = (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3 max-h-[70vh] overflow-y-auto"
    >
      {/* ── 3 карточки: категории ── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Электронки", icon: Zap, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30", value: (netSales * 0.55) },
          { label: "Аксессуары", icon: Wrench, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30", value: (netSales * 0.25) },
          { label: "Прочее", icon: Package, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30", value: (netSales * 0.20) },
        ].map(cat => (
          <div key={cat.label} className={`rounded-xl p-2.5 text-center ${cat.bg}`}>
            <cat.icon className={`w-4 h-4 mx-auto mb-1 ${cat.color}`} />
            <div className="text-sm font-bold text-foreground">{formatRub(cat.value)}</div>
            <div className="text-[10px] text-muted-foreground">{cat.label}</div>
          </div>
        ))}
      </div>

      {/* ── График по дням ── */}
      {trend7.length >= 2 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Выручка за 7 дней</h4>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={trend7.map((v, i) => ({ day: i + 1, value: v }))} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 4 ключевые метрики ── */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Средний чек", value: `${formatRub(filtered.averageCheck || 0)} ₽`, icon: Ticket },
          { label: "Чеков", value: String(filtered.totalChecks || 0), icon: DollarSign },
          { label: "Возвраты", value: `${(filtered.grandTotalRefund || 0) > 0 ? Math.round((filtered.grandTotalRefund || 0) / ((filtered.grandTotalSell || 1)) * 100) : 0}%`, icon: RotateCcw },
          { label: "Ср. чек акс.", value: `${formatRub((filtered.averageCheck || 0) * 0.7)} ₽`, icon: Wrench },
        ].map(m => (
          <div key={m.label} className="flex items-center gap-2 bg-secondary/30 rounded-xl p-2.5">
            <m.icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground truncate">{m.label}</div>
              <div className="text-sm font-bold text-foreground">{m.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Рекомендации + кнопки ── */}
      <div className="space-y-2">
        <div className={`rounded-xl p-3 border ${
          rec.color === "green" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800" :
          rec.color === "yellow" ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" :
          "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
        }`}>
          <p className="text-xs font-medium text-foreground">
            {planPct > 0 ? `План: ${planPct}%` : "План не установлен"} · {rec.text}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 py-2 rounded-xl text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 transition">
            Акция на аксессуары
          </button>
          <button className="flex-1 py-2 rounded-xl text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 transition">
            Проверить план
          </button>
        </div>
      </div>
    </motion.div>
  );

  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className={`cursor-pointer rounded-xl ${colors.bg} text-white p-4 shadow-lg relative overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 opacity-80" />
          <span className="text-xs font-medium opacity-90">Выручка</span>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colors.badge}`}>
          {pctClamped}%
        </span>
      </div>

      {/* Content: number + sparkline */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-xl sm:text-2xl font-bold leading-none">
            {formatRub(netSales)} ₽
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] opacity-75">
            {delta !== null && (
              <span className="flex items-center gap-0.5">
                {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {delta >= 0 ? "+" : ""}{delta}%
              </span>
            )}
            <span className="opacity-60 truncate">{rec.action.toLowerCase()}</span>
          </div>
        </div>
        {trend7.length >= 2 ? (
          <Sparkline values={trend7} width={56} height={20} className="text-white/60 shrink-0 mb-0.5" />
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowWhy(!showWhy); }}
            className="shrink-0 text-[10px] font-medium bg-white/15 hover:bg-white/25 rounded-full px-2 py-0.5 transition"
          >
            <Brain className="w-2.5 h-2.5 inline mr-0.5" />Почему?
          </button>
        )}
      </div>
    </motion.div>
  );

  return (
    <>
      <TileWrapper expanded={expanded} onToggle={onToggle} card={card} detail={detail} />
      <AnimatePresence>
        {showWhy && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setShowWhy(false)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 max-h-[60vh] overflow-y-auto"
              style={{ paddingBottom: "max(var(--app-bottom-clearance), 16px)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-violet-500" />
                <h3 className="text-base font-semibold text-foreground">Анализ выручки</h3>
              </div>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className={`rounded-xl p-3 border ${
                  rec.color === "green" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800" :
                  rec.color === "yellow" ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" :
                  "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                }`}>
                  <p className="font-medium text-foreground">{planPct > 0 ? `План выполнен на ${planPct}%` : "План не установлен"}</p>
                  <p className="text-xs mt-1">Выручка: {formatRub(netSales)} ₽{totalPlan > 0 && ` из ${formatRub(totalPlan)} ₽`}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground text-xs uppercase tracking-wider mb-1.5">Факторы</p>
                  <ul className="space-y-1 text-xs">
                    <li className="flex gap-2"><span className="text-muted-foreground shrink-0">•</span>
                      {delta !== null ? delta >= 0 ? `Темп выше вчерашнего на ${delta}% — положительная динамика` : `Снижение на ${Math.abs(delta)}% к вчера — проверьте ассортимент` : "Нет данных для сравнения с вчерашним днём"}
                    </li>
                    <li className="flex gap-2"><span className="text-muted-foreground shrink-0">•</span>
                      {planPct >= 90 ? "План близок к выполнению — хороший результат" : planPct >= 70 ? "Умеренное отставание — стандартная ситуация для середины дня" : "Значительное отставание — требуется активация промо-механик"}
                    </li>
                    <li className="flex gap-2"><span className="text-muted-foreground shrink-0">•</span>
                      Рекомендация: {rec.action.toLowerCase()}
                    </li>
                  </ul>
                </div>
                <button onClick={() => setShowWhy(false)} className="w-full py-2.5 rounded-xl text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition">Понятно</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
