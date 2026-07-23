import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDashboardHomeInsights } from "@/hooks/dashboard/useDashboardHomeInsights";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import type { LeaderMode } from "@/widgets/dashboard/cards/BestShopCard";
import type { ShopKpiRow } from "@/widgets/dashboard/cards/BestShopDetails";
import { SkeletonCard } from "./widgetUtils";
import {
  Award, TrendingUp, TrendingDown, Trophy, Medal, Target,
  BarChart3, Wallet, Receipt, RotateCcw, Banknote, AlertTriangle,
} from "lucide-react";

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function pctDiff(val: number, avg: number): string {
  if (avg === 0) return "—";
  const d = ((val - avg) / avg) * 100;
  return `${d >= 0 ? "+" : ""}${Math.round(d)}%`;
}

function vsAvgColor(val: number, avg: number, higherIsBetter: boolean): string {
  if (avg === 0) return "hsl(var(--muted-foreground))";
  const diff = (val - avg) / avg;
  if (higherIsBetter) {
    return diff >= 0 ? "hsl(var(--success))" : diff >= -0.1 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  }
  // For refund rate: lower is better
  return diff <= 0 ? "hsl(var(--success))" : diff <= 0.3 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
}

function getHints(shop: ShopKpiRow, avgCheck: number, avgRefund: number, avgExpRatio: number): string[] {
  const hints: string[] = [];
  if (shop.averageCheck < avgCheck * 0.85) hints.push("↑ средний чек");
  if (shop.refundRate > Math.max(avgRefund + 2, 4)) hints.push("↓ возвраты");
  const expRatio = shop.revenue > 0 ? shop.expenses / shop.revenue : 0;
  if (expRatio > Math.max(avgExpRatio + 0.03, 0.08)) hints.push("↓ расходы");
  if (shop.checks < 5) hints.push("↑ трафик");
  if (hints.length === 0) hints.push("✓ держать темп");
  return hints;
}

interface Props { since: string; until: string; dateMode: "today" | "yesterday" | "period"; expanded: boolean; onToggle: () => void }

export function BestShopWidget({ since, until, dateMode, expanded, onToggle }: Props) {
  const [mode, setMode] = useState<LeaderMode>("day");
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const insights = useDashboardHomeInsights({ since, until, dateMode, shopUuid, enabled: true });
  const { bestShop, loading } = insights;
  const dayLeader = bestShop.dayLeader;
  const weekLeader = bestShop.weekLeader;
  const rows = mode === "week" ? bestShop.weekRows : bestShop.dayRows;
  const currentLeader = mode === "week" ? weekLeader : dayLeader;
  const sorted = useMemo(() => [...rows].sort((a, b) => b.netRevenue - a.netRevenue), [rows]);

  if (loading && !dayLeader && !weekLeader) return <SkeletonCard tone="purple" />;
  if (!sorted.length) return <SkeletonCard tone="purple" />;
  if (!dayLeader && !weekLeader) return <SkeletonCard tone="purple" />;

  // Network averages
  const avgNet = sorted.reduce((s, r) => s + r.netRevenue, 0) / sorted.length;
  const avgCheck = sorted.reduce((s, r) => s + r.averageCheck, 0) / sorted.length;
  const avgRefund = sorted.reduce((s, r) => s + r.refundRate, 0) / sorted.length;
  const avgExpRatio = sorted.reduce((s, r) => s + (r.revenue > 0 ? r.expenses / r.revenue : 0), 0) / sorted.length;

  const leader = sorted[0];
  const lagging = sorted.slice(-2).reverse();
  const leaderReason = currentLeader?.reason === "чек" ? "высокий средний чек" :
    currentLeader?.reason === "трафик" ? "больше покупателей" : "конверсия";

  // ═══ Свёрнутая карточка ═══
  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full"
      style={{ backgroundColor: "hsl(var(--chart-2))" }}
    >
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Award className="w-5 h-5 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">Эффективность</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            <button
              onClick={(e) => { e.stopPropagation(); setMode(mode === "day" ? "week" : "day"); }}
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-black/25 hover:bg-black/35 transition"
            >
              {mode === "day" ? "День" : "Неделя"}
            </button>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate leading-tight">#{1} {leader.name}</div>
            <div className="text-sm opacity-90 mt-1 truncate flex items-center gap-1">
              {formatRub(leader.netRevenue)} ₽
              <span className="text-[10px] opacity-60 ml-1">· {leaderReason}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );

  // ═══ Развёрнутый вид ═══
  const detail = (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3 max-h-[55vh] overflow-y-auto"
    >
      {/* Заголовок + режим */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-chart-2" />
          <h3 className="text-sm font-bold text-foreground">Эффективность магазинов</h3>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5 text-[10px]">
          <button
            className={`rounded px-2 py-0.5 ${mode === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("day")}
          >День</button>
          <button
            className={`rounded px-2 py-0.5 ${mode === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("week")}
          >Неделя</button>
        </div>
      </div>

      {/* Лидер — крупная карточка */}
      <div className="rounded-xl p-4 text-white" style={{ backgroundColor: "hsl(var(--chart-2))" }}>
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-5 h-5" />
          <span className="text-sm font-bold">Лидер: {leader.name}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-bold">{formatRub(leader.netRevenue)}</div>
            <div className="text-[10px] opacity-80">Нетто ₽</div>
            <div className="text-[9px] opacity-60">{pctDiff(leader.netRevenue, avgNet)} к среднему</div>
          </div>
          <div>
            <div className="text-xl font-bold">{leader.checks}</div>
            <div className="text-[10px] opacity-80">Чеков</div>
            <div className="text-[9px] opacity-60">{pctDiff(leader.checks, sorted.reduce((s, r) => s + r.checks, 0) / sorted.length)} к среднему</div>
          </div>
          <div>
            <div className="text-xl font-bold">{formatRub(leader.averageCheck)}</div>
            <div className="text-[10px] opacity-80">Ср. чек ₽</div>
            <div className="text-[9px] opacity-60">{pctDiff(leader.averageCheck, avgCheck)} к среднему</div>
          </div>
        </div>
        {currentLeader && (
          <div className="mt-2 text-[10px] opacity-80 text-center">
            Отрыв от 2-го: +{formatRub(Math.max(0, currentLeader.gapToSecond))} ₽ · причина: {leaderReason}
          </div>
        )}
      </div>

      {/* Сравнительная таблица по метрикам */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Сравнение ({sorted.length} магазинов)
        </h4>

        {/* Заголовки колонок */}
        <div className="flex items-center text-[9px] text-muted-foreground mb-1 px-1">
          <span className="flex-1 min-w-0" />
          <span className="w-14 text-right">Нетто</span>
          <span className="w-10 text-right">Чеки</span>
          <span className="w-12 text-right">Ср.чек</span>
          <span className="w-10 text-right">Возврат</span>
          <span className="w-12 text-right">Расходы</span>
        </div>

        <div className="space-y-1.5">
          {sorted.map((shop, i) => {
            const maxNet = sorted[0]?.netRevenue || 1;
            const maxChecks = Math.max(...sorted.map(s => s.checks), 1);
            const maxAvg = Math.max(...sorted.map(s => s.averageCheck), 1);
            const maxRefund = Math.max(...sorted.map(s => s.refundRate), 1);
            const maxExp = Math.max(...sorted.map(s => s.revenue > 0 ? s.expenses / s.revenue : 0), 0.01);

            const expRatio = shop.revenue > 0 ? shop.expenses / shop.revenue : 0;

            const metrics = [
              { val: shop.netRevenue, max: maxNet, color: vsAvgColor(shop.netRevenue, avgNet, true), fmt: formatRub(shop.netRevenue) },
              { val: shop.checks, max: maxChecks, color: vsAvgColor(shop.checks, sorted.reduce((s, r) => s + r.checks, 0) / sorted.length, true), fmt: String(shop.checks) },
              { val: shop.averageCheck, max: maxAvg, color: vsAvgColor(shop.averageCheck, avgCheck, true), fmt: formatRub(shop.averageCheck) },
              { val: shop.refundRate, max: maxRefund, color: vsAvgColor(shop.refundRate, avgRefund, false), fmt: `${shop.refundRate.toFixed(1)}%` },
              { val: expRatio, max: maxExp, color: vsAvgColor(expRatio, avgExpRatio, false), fmt: `${(expRatio * 100).toFixed(0)}%` },
            ];

            return (
              <div key={shop.name} className="flex items-center gap-1 text-xs">
                <span className="flex-1 min-w-0 truncate flex items-center gap-1 text-foreground font-medium">
                  {i === 0 ? <Trophy className="w-3 h-3 text-yellow-500 shrink-0" /> :
                   i === 1 ? <Medal className="w-3 h-3 text-slate-400 shrink-0" /> :
                   i === 2 ? <Medal className="w-3 h-3 text-orange-400 shrink-0" /> :
                   <span className="w-3 text-[9px] text-muted-foreground text-center shrink-0">{i + 1}</span>}
                  {shop.name}
                </span>
                {metrics.map((m, mi) => (
                  <div key={mi} className="relative" style={{ width: mi === 0 ? 56 : mi === 1 ? 40 : mi === 2 ? 48 : mi === 3 ? 40 : 48 }}>
                    <div className="h-3.5 rounded-full overflow-hidden bg-muted/40">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((m.val / m.max) * 100, 100)}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: m.color, opacity: 0.35 }}
                      />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-end pr-1 text-[8px] text-foreground/70 tabular-nums">
                      {m.fmt}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Среднее по сети */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50 px-1">
          <span className="flex-1 font-medium">Среднее</span>
          <span className="w-14 text-right tabular-nums">{formatRub(avgNet)}</span>
          <span className="w-10 text-right tabular-nums">{Math.round(sorted.reduce((s, r) => s + r.checks, 0) / sorted.length)}</span>
          <span className="w-12 text-right tabular-nums">{formatRub(avgCheck)}</span>
          <span className="w-10 text-right tabular-nums">{avgRefund.toFixed(1)}%</span>
          <span className="w-12 text-right tabular-nums">{(avgExpRatio * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Отстающие — что подтянуть */}
      {lagging.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wider">
              Что подтянуть
            </span>
          </div>
          <div className="space-y-1.5">
            {lagging.map((shop) => (
              <div key={shop.name} className="flex items-start gap-2 text-xs">
                <span className="font-medium text-foreground shrink-0">{shop.name}:</span>
                <span className="text-muted-foreground">
                  {getHints(shop, avgCheck, avgRefund, avgExpRatio).join(" · ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );

  return (
    <div>
      <div onClick={onToggle}>{card}</div>
      <AnimatePresence>{expanded && detail}</AnimatePresence>
    </div>
  );
}
