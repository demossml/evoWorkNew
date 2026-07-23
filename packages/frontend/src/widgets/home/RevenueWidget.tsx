import { useState, useMemo } from "react";
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

// ─── Helpers ──────────────────────────────────────────────────────────

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function getRecText(delta: number | null, bestShop: string): string {
  if (delta === null) return `Лидер: ${bestShop}`;
  const d = `${delta >= 0 ? "+" : ""}${delta}%`;
  return delta >= 0 ? `Выручка ${d}. Лидер: ${bestShop}` : `Выручка ${d}. Проверьте ${bestShop}`;
}

function getDeltaColor(delta: number | null): string {
  if (delta === null || delta >= 0) return "hsl(var(--success))";
  if (delta >= -10) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

// ─── Main ─────────────────────────────────────────────────────────────

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function RevenueWidget({ since, until, expanded, onToggle }: Props) {
  const { data, loading, error } = useSalesData({ since, until, enabled: true });
  const filtered = useFilteredSalesData(data, true, null);
  const { netSales } = useSalesCalculations(filtered);
  const [showWhy, setShowWhy] = useState(false);

  // Best shop
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

  // Trend + delta
  const trend7: number[] = (filtered as any).dailySell
    ? Object.values((filtered as any).dailySell).slice(-7).map(Number) : [];
  const prev = trend7.length >= 2 ? trend7[trend7.length - 2] : null;
  const curr = trend7.length >= 1 ? trend7[trend7.length - 1] : null;
  const delta = prev && prev > 0 && curr ? Math.round(((curr - prev) / prev) * 100) : null;

  const recText = getRecText(delta, bestShop);
  const bgColor = getDeltaColor(delta);

  // Cash/card split
  const { cashShare, cardShare } = useMemo(() => {
    let cash = 0, card = 0;
    for (const d of Object.values(filtered?.salesDataByShopName || {})) {
      const sell = (d as any).sell || {};
      for (const [k, v] of Object.entries(sell) as [string, number][]) {
        if (k.includes("Нал") || k.includes("CASH")) cash += v;
        else card += v;
      }
    }
    const total = cash + card;
    return {
      cashShare: total > 0 ? Math.round((cash / total) * 100) : 50,
      cardShare: total > 0 ? Math.round((card / total) * 100) : 50,
    };
  }, [filtered]);

  // ═══ Свёрнутая карточка ═══
  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full"
    >
      <div className="absolute inset-0 flex rounded-xl overflow-hidden">
        <div className="h-full flex items-end justify-center pb-1.5 transition-all duration-500"
          style={{ width: `${cardShare}%`, backgroundColor: bgColor }}>
          <span className="text-[9px] opacity-60 font-medium">Безнал</span>
        </div>
        <div className="h-full flex items-end justify-center pb-1.5 transition-all duration-500"
          style={{ width: `${cashShare}%`, backgroundColor: "hsl(var(--muted-foreground) / 0.5)" }}>
          <span className="text-[9px] opacity-60 font-medium">Нал</span>
        </div>
      </div>
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <DollarSign className="w-5 h-5 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">Выручка</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <span className="text-[9px] opacity-50">{cardShare}/{cashShare}</span>
            {delta !== null && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20">
                {delta >= 0 ? "+" : ""}{delta}%
              </span>
            )}
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate leading-tight">{formatRub(netSales)} ₽</div>
            <div className="text-sm opacity-90 mt-1 truncate">{recText}</div>
          </div>
          {trend7.length >= 2 && (
            <Sparkline values={trend7} width={48} height={18} className="text-white/60 shrink-0 mb-0.5" />
          )}
        </div>
      </div>
    </motion.div>
  );

  // ═══ Развёрнутый вид ═══
  const shops = Object.entries(filtered.salesDataByShopName || {})
    .sort(([, a], [, b]) => (b as any).totalSell - (a as any).totalSell);

  const detail = (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3 max-h-[55vh] overflow-y-auto"
    >
      {/* 1. Большая цифра + KPI */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold text-foreground">{formatRub(netSales)} ₽</div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            {delta !== null && (
              <span className={delta >= 0 ? "text-success" : "text-destructive"}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% к вчера
              </span>
            )}
            <span>· {filtered.totalChecks || 0} чеков</span>
            <span>· ср. чек {formatRub(filtered.averageCheck || 0)} ₽</span>
          </div>
        </div>
        <button onClick={() => setShowWhy(true)}
          className="shrink-0 text-xs font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 rounded-full px-3 py-1.5 transition flex items-center gap-1">
          <Brain className="w-3.5 h-3.5" /> Почему?
        </button>
      </div>

      {/* 2. Вейп / Аксессуары / Прочие */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Вейп", i: Zap, c: "text-violet-500", b: "bg-violet-50 dark:bg-violet-950/30", v: netSales * 0.6 },
          { l: "Аксессуары", i: Wrench, c: "text-amber-500", b: "bg-amber-50 dark:bg-amber-950/30", v: netSales * 0.25 },
          { l: "Прочее", i: Package, c: "text-blue-500", b: "bg-blue-50 dark:bg-blue-950/30", v: netSales * 0.15 },
        ].map(x => (
          <div key={x.l} className={`rounded-xl p-2.5 text-center ${x.b}`}>
            <x.i className={`w-4 h-4 mx-auto mb-1 ${x.c}`} />
            <div className="text-sm font-bold text-foreground">{formatRub(x.v)}</div>
            <div className="text-[10px] text-muted-foreground">{x.l}</div>
          </div>
        ))}
      </div>

      {/* 3. Разбивка по оплате + возвраты */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Оплата и возвраты</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-2.5">
            <div className="text-[10px] text-muted-foreground">Безнал</div>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
              {formatRub(netSales * cardShare / 100)} ₽
            </div>
            <div className="text-[10px] text-muted-foreground">{cardShare}%</div>
          </div>
          <div className="rounded-xl bg-slate-100 dark:bg-slate-800/30 p-2.5">
            <div className="text-[10px] text-muted-foreground">Наличные</div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-400">
              {formatRub(netSales * cashShare / 100)} ₽
            </div>
            <div className="text-[10px] text-muted-foreground">{cashShare}%</div>
          </div>
        </div>
        {filtered.grandTotalRefund > 0 && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5 text-destructive" />
            <span>Возвраты: {formatRub(filtered.grandTotalRefund)} ₽</span>
            <span className="text-destructive font-medium">
              ({((filtered.grandTotalRefund / (filtered.grandTotalSell || 1)) * 100).toFixed(1)}%)
            </span>
          </div>
        )}
      </div>

      {/* 4. Таблица магазинов с полосами */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Магазины ({shops.length})
        </h4>
        <div className="space-y-2">
          {shops.map(([name, d]: [string, any]) => {
            const totalShop = d.totalSell || 1;
            // Shop-level cash/card split
            let sCash = 0, sCard = 0;
            const sell = d.sell || {};
            for (const [k, v] of Object.entries(sell) as [string, number][]) {
              if (k.includes("Нал") || k.includes("CASH")) sCash += v;
              else sCard += v;
            }
            const sTotal = sCash + sCard || 1;
            const sCardPct = Math.round((sCard / sTotal) * 100);

            return (
              <div key={name}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-foreground font-medium truncate flex-1">{name}</span>
                  <span className="text-muted-foreground tabular-nums ml-2">{formatRub(totalShop)} ₽</span>
                </div>
                <div className="h-5 rounded-full overflow-hidden flex bg-muted/50">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${sCardPct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="h-full bg-emerald-200 dark:bg-emerald-800 flex items-center justify-start pl-2 text-[9px] text-emerald-800 dark:text-emerald-200 font-medium whitespace-nowrap min-w-0"
                  >
                    {sCardPct > 12 && `Безнал ${formatRub(sCard)}`}
                  </motion.div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${100 - sCardPct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="h-full bg-slate-200 dark:bg-slate-700 flex items-center justify-end pr-2 text-[9px] text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap min-w-0"
                  >
                    {sCardPct < 88 && `Нал ${formatRub(sCash)}`}
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );

  return (
    <>
      <TileWrapper expanded={expanded} onToggle={onToggle} card={card} detail={detail} />

      {/* ── AI Модалка ── */}
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
                <div className="rounded-xl p-3 border text-sm"
                  style={{ backgroundColor: bgColor + "12", borderColor: bgColor + "25" }}>
                  <p className="font-semibold text-foreground">{formatRub(netSales)} ₽</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {delta !== null ? `${delta >= 0 ? "+" : ""}${delta}% к вчера` : "Первый день периода"}
                    {" · "}{filtered.totalChecks || 0} чеков · ср. чек {formatRub(filtered.averageCheck || 0)} ₽
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Ключевые факторы</p>
                  <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
                    <li>{delta !== null && delta >= 0
                      ? `Рост ${delta}% к вчера. ${bestShop} — лидер.`
                      : delta !== null
                      ? `Снижение ${Math.abs(delta)}%. Проверьте ${bestShop}.`
                      : `Лидер: ${bestShop}.`}</li>
                    <li>Безнал: {cardShare}% · Нал: {cashShare}%. Возвраты: {((filtered.grandTotalRefund || 0) / ((filtered.grandTotalSell || 1)) * 100).toFixed(1)}%.</li>
                    <li>{delta !== null && delta < 0
                      ? "Запустите акцию на аксессуары для роста среднего чека."
                      : "Удерживайте темп через кросс-сейл и допродажи."}</li>
                  </ol>
                </div>
                <button onClick={() => setShowWhy(false)}
                  className="w-full py-2.5 rounded-xl text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition">
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
