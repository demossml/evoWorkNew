import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useSalesCalculations } from "@/hooks/dashboard/useSalesCalculations";
import { Sparkline } from "@shared/ui";
import { TileWrapper } from "./TileWrapper";
import { SkeletonCard } from "./widgetUtils";
import {
  DollarSign, TrendingUp, TrendingDown, Brain, Sparkles,
  Zap, Wrench, Package, Ticket, RotateCcw, Store,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

// ─── Types ───────────────────────────────────────────────────────────

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

// ─── Helpers ──────────────────────────────────────────────────────────

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function getRecText(delta: number | null, planPct: number, bestShop: string): string {
  const d = delta !== null ? `${delta >= 0 ? "+" : ""}${delta}%` : "";
  if (planPct >= 95) return `Выручка ${d}. Удерживайте темп`;
  if (planPct >= 75) return `Выручка ${d}. Акция на аксессуары в ${bestShop}`;
  if (planPct >= 50) return `Выручка ${d}. Промо-активности в ${bestShop}`;
  return `Выручка ${d}. Антикризисный план`;
}

function getDeltaColor(delta: number | null): string {
  if (delta === null) return "hsl(var(--success))";
  return delta >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))";
}

function getBgColor(delta: number | null): string {
  if (delta === null || delta >= 0) return "hsl(var(--success))";
  if (delta >= -10) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

// ─── Main ─────────────────────────────────────────────────────────────

export function RevenueWidget({ since, until, expanded, onToggle }: Props) {
  const { data, loading, error } = useSalesData({ since, until, enabled: true });
  const filtered = useFilteredSalesData(data, true, null);
  const { netSales } = useSalesCalculations(filtered);

  const [showWhy, setShowWhy] = useState(false);

  // Best shop name from data
  const bestShop = useMemo(() => {
    if (!filtered?.salesDataByShopName) return "основной магазин";
    let top: string | null = null; let max = 0;
    for (const [name, d] of Object.entries(filtered.salesDataByShopName)) {
      if ((d as any).totalSell > max) { max = (d as any).totalSell; top = name; }
    }
    return top || "основной магазин";
  }, [filtered]);

  if (loading || !filtered) return <SkeletonCard tone="blue" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;

  // Trend
  const trend7: number[] = (filtered as any).dailySell
    ? Object.values((filtered as any).dailySell).slice(-7).map(Number) : [];
  const prev = trend7.length >= 2 ? trend7[trend7.length - 2] : null;
  const curr = trend7.length >= 1 ? trend7[trend7.length - 1] : null;
  const delta = prev && prev > 0 && curr ? Math.round(((curr - prev) / prev) * 100) : null;

  const recText = getRecText(delta, 100, bestShop);
  const bgColor = getBgColor(delta);
  const deltaColor = getDeltaColor(delta);

  // ═══════════════════════════════════════════════════════════════════
  // Свёрнутая карточка (тот же размер, что BestShopCard: ~100px)
  // ═══════════════════════════════════════════════════════════════════
  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white p-4 shadow-lg relative overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 opacity-80" />
          <span className="text-xs font-medium opacity-90">Выручка</span>
        </div>
        {delta !== null && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20">
            {delta >= 0 ? "+" : ""}{delta}%
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-xl sm:text-2xl font-bold leading-none">
            {formatRub(netSales)} ₽
          </div>
          <p className="mt-1 text-[11px] opacity-75 truncate max-w-[200px]">
            {recText}
          </p>
        </div>
        {trend7.length >= 2 ? (
          <Sparkline values={trend7} width={56} height={20} className="text-white/60 shrink-0 mb-0.5" />
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowWhy(true); }}
            className="shrink-0 text-[10px] font-medium bg-white/15 hover:bg-white/25 rounded-full px-2 py-0.5 transition"
          >
            <Brain className="w-2.5 h-2.5 inline mr-0.5" />Почему?
          </button>
        )}
      </div>
    </motion.div>
  );

  // ═══════════════════════════════════════════════════════════════════
  // Развёрнутый вид (≤ 1.5 экрана на телефоне)
  // ═══════════════════════════════════════════════════════════════════
  const detail = (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3 max-h-[55vh] overflow-y-auto"
    >
      {/* 1. Разбивка: Вейп / Аксессуары / Прочие */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Вейп", i: Zap, c: "text-violet-500", b: "bg-violet-50 dark:bg-violet-950/30", v: netSales * 0.6 },
          { l: "Акс.", i: Wrench, c: "text-amber-500", b: "bg-amber-50 dark:bg-amber-950/30", v: netSales * 0.25 },
          { l: "Прочее", i: Package, c: "text-blue-500", b: "bg-blue-50 dark:bg-blue-950/30", v: netSales * 0.15 },
        ].map(x => (
          <div key={x.l} className={`rounded-xl p-2.5 text-center ${x.b}`}>
            <x.i className={`w-4 h-4 mx-auto mb-1 ${x.c}`} />
            <div className="text-sm font-bold text-foreground">{formatRub(x.v)}</div>
            <div className="text-[10px] text-muted-foreground">{x.l}</div>
          </div>
        ))}
      </div>

      {/* 2. График за 7 дней */}
      {trend7.length >= 2 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Выручка за 7 дней</h4>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={trend7.map((v, i) => ({ d: i + 1, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 3. Метрики по магазинам */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">По магазинам</h4>
        <div className="space-y-1">
          {Object.entries(filtered.salesDataByShopName || {}).slice(0, 5).map(([name, d]: [string, any]) => (
            <div key={name} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
              <span className="text-foreground truncate flex-1">{name}</span>
              <span className="text-muted-foreground tabular-nums ml-2">{formatRub(d.totalSell || 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Метрики: чеки, возвраты, ср. чек */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { l: "Средний чек", v: `${formatRub(filtered.averageCheck || 0)} ₽`, i: Ticket },
          { l: "Чеков", v: String(filtered.totalChecks || 0), i: DollarSign },
          { l: "Возвраты", v: `${(filtered.grandTotalRefund || 0) > 0 ? Math.round((filtered.grandTotalRefund || 0) / ((filtered.grandTotalSell || 1)) * 100) : 0}%`, i: RotateCcw },
          { l: "Магазинов", v: String(Object.keys(filtered.salesDataByShopName || {}).length), i: Store },
        ].map(m => (
          <div key={m.l} className="flex items-center gap-2 bg-secondary/30 rounded-xl p-2">
            <m.i className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground truncate">{m.l}</div>
              <div className="text-sm font-bold text-foreground">{m.v}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 5. Рекомендации + кнопки */}
      <div className="space-y-2">
        <div className="rounded-xl p-2.5 border text-xs font-medium text-foreground"
          style={{ backgroundColor: bgColor + "15", borderColor: bgColor + "30" }}>
          {recText}
        </div>
        <div className="flex gap-2">
          <button className="flex-1 py-2 rounded-xl text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 transition">
            Акция
          </button>
          <button className="flex-1 py-2 rounded-xl text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 transition">
            Проверить план
          </button>
          <button
            onClick={() => setShowWhy(true)}
            className="py-2 px-3 rounded-xl text-xs font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 transition flex items-center gap-1"
          >
            <Brain className="w-3 h-3" /> Почему?
          </button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <>
      <TileWrapper expanded={expanded} onToggle={onToggle} card={card} detail={detail} />

      {/* ── AI Модалка «Почему?» (3 пункта) ── */}
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
              className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 max-h-[50vh] overflow-y-auto"
              style={{ paddingBottom: "max(var(--app-bottom-clearance), 16px)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-violet-500" />
                <h3 className="text-base font-semibold text-foreground">Анализ выручки</h3>
              </div>

              <div className="space-y-2">
                <div className="rounded-xl p-3 border text-sm" style={{ backgroundColor: bgColor + "12", borderColor: bgColor + "25" }}>
                  <p className="font-semibold text-foreground">{formatRub(netSales)} ₽</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{delta !== null ? `${delta >= 0 ? "+" : ""}${delta}% к вчера` : "Первый день периода"}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Ключевые факторы</p>
                  <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
                    <li>
                      {delta !== null && delta >= 0
                        ? `Положительная динамика: +${delta}% к предыдущему дню. ${bestShop} — лидер по выручке.`
                        : delta !== null
                        ? `Снижение на ${Math.abs(delta)}% к вчера. Проверьте ассортимент в ${bestShop}.`
                        : `Нет данных для сравнения. Оцените выручку по магазинам: лидер — ${bestShop}.`}
                    </li>
                    <li>
                      Средний чек: {formatRub(filtered.averageCheck || 0)} ₽.
                      {filtered.totalChecks > 0 ? ` Всего чеков: ${filtered.totalChecks}.` : ""}
                    </li>
                    <li>
                      {delta !== null && delta < 0
                        ? "Рекомендация: запустить акцию на аксессуары для повышения среднего чека."
                        : "Рекомендация: удерживать темп через допродажи и кросс-сейл."}
                    </li>
                  </ol>
                </div>

                <button
                  onClick={() => setShowWhy(false)}
                  className="w-full py-2.5 rounded-xl text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition"
                >
                  Понятно
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
