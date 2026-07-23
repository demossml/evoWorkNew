import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDashboardHomeInsights } from "@/hooks/dashboard/useDashboardHomeInsights";
import { useGrossProfit } from "@/hooks/dashboard/useGrossProfit";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { SkeletonCard } from "./widgetUtils";
import {
  Award, Trophy, Medal, Target, BarChart3, TrendingUp, Banknote,
} from "lucide-react";

type DateMode = "today" | "yesterday" | "week";

function formatRub(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("ru-RU");
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
  return diff <= 0 ? "hsl(var(--success))" : diff <= 0.3 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
}

function getDateRange(mode: DateMode): { since: string; until: string; dateMode: "today" | "yesterday" | "period" } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (mode === "today") {
    const s = fmt(now);
    return { since: s, until: s, dateMode: "today" };
  }
  if (mode === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const s = fmt(y);
    return { since: s, until: s, dateMode: "yesterday" };
  }
  // week: last 7 days
  const end = new Date(now);
  const start = new Date(now); start.setDate(start.getDate() - 6);
  return { since: fmt(start), until: fmt(end), dateMode: "period" };
}

interface Props { since: string; until: string; dateMode: "today" | "yesterday" | "period"; expanded: boolean; onToggle: () => void }

export function BestShopWidget({ since, until, dateMode: _dm, expanded, onToggle }: Props) {
  const [mode, setMode] = useState<DateMode>("today");
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const range = getDateRange(mode);
  const insights = useDashboardHomeInsights({ ...range, shopUuid, enabled: true });
  const { bestShop, loading } = insights;
  const { data: grossProfit } = useGrossProfit({ since: range.since, until: range.until });
  const rows = mode === "week" ? bestShop.weekRows : bestShop.dayRows;

  // Margin map: shopName → { pct, profit }
  const marginMap = useMemo(() => {
    const m = new Map<string, { pct: number; profit: number }>();
    if (!grossProfit?.shops) return m;
    for (const [name, gp] of Object.entries(grossProfit.shops)) {
      if (gp.revenue > 0) {
        m.set(name, { pct: Math.round((gp.profit / gp.revenue) * 100), profit: Math.round(gp.profit) });
      }
    }
    return m;
  }, [grossProfit]);

  // Rank by profit (₽) — money is what matters
  const rankScore = (shop: typeof rows[0]): number => {
    return marginMap.get(shop.name)?.profit ?? 0;
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => rankScore(b) - rankScore(a)), [rows, marginMap]);

  if (loading && !rows.length) return <SkeletonCard tone="purple" />;
  if (!sorted.length) return <SkeletonCard tone="purple" />;

  // Averages
  const avgNet = sorted.reduce((s, r) => s + r.netRevenue, 0) / sorted.length;
  const avgCheck = sorted.reduce((s, r) => s + r.averageCheck, 0) / sorted.length;
  const avgRefund = sorted.reduce((s, r) => s + r.refundRate, 0) / sorted.length;
  const avgExpRatio = sorted.reduce((s, r) => s + (r.revenue > 0 ? r.expenses / r.revenue : 0), 0) / sorted.length;
  const allProfits = sorted.map(s => marginMap.get(s.name)?.profit ?? 0).filter(v => v > 0);
  const avgProfit = allProfits.length > 0 ? allProfits.reduce((s, v) => s + v, 0) / allProfits.length : 0;

  const leader = sorted[0];
  const leaderMargin = marginMap.get(leader.name);
  const lagging = sorted.slice(-2).reverse();

  const modeLabels: Record<DateMode, string> = { today: "Сегодня", yesterday: "Вчера", week: "Нед." };
  const nextMode = (m: DateMode): DateMode => m === "today" ? "yesterday" : m === "yesterday" ? "week" : "today";

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
              onClick={(e) => { e.stopPropagation(); setMode(nextMode(mode)); }}
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-black/25 hover:bg-black/35 transition"
            >
              {modeLabels[mode]}
            </button>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate leading-tight">#{1} {leader.name}</div>
            <div className="text-sm opacity-90 mt-1 truncate flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" />
              <span>{formatRub(leader.netRevenue)} ₽</span>
              {leaderMargin && (
                <span className="text-[10px] opacity-75">· {formatRub(leaderMargin.profit)} ₽ приб.</span>
              )}
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
          <h3 className="text-sm font-bold text-foreground">Эффективность</h3>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5 text-[10px]">
          {(["today", "yesterday", "week"] as DateMode[]).map(m => (
            <button
              key={m}
              className={`rounded px-2 py-0.5 ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setMode(m)}
            >{modeLabels[m]}</button>
          ))}
        </div>
      </div>

      {/* Лидер */}
      <div className="rounded-xl p-4 text-white" style={{ backgroundColor: "hsl(var(--chart-2))" }}>
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-5 h-5" />
          <span className="text-sm font-bold">Лидер: {leader.name}</span>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-xl font-bold">{formatRub(leader.netRevenue)}</div>
            <div className="text-[10px] opacity-80">Выр. ₽</div>
            <div className="text-[9px] opacity-60">{pctDiff(leader.netRevenue, avgNet)} к ср.</div>
          </div>
          <div>
            <div className="text-xl font-bold">{leader.checks}</div>
            <div className="text-[10px] opacity-80">Чеков</div>
          </div>
          <div>
            <div className="text-xl font-bold">{formatRub(leader.averageCheck)}</div>
            <div className="text-[10px] opacity-80">Ср.чек ₽</div>
          </div>
          <div>
            <div className="text-xl font-bold">{leaderMargin ? formatRub(leaderMargin.profit) : "—"}</div>
            <div className="text-[10px] opacity-80">Прибыль ₽</div>
            <div className="text-[9px] opacity-60">{leaderMargin ? `${leaderMargin.pct}%` : ""}</div>
          </div>
        </div>
      </div>

      {/* Сравнительная таблица */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Рейтинг по прибыли ({sorted.length})
        </h4>

        {/* Заголовки */}
        <div className="flex items-center text-[8px] text-muted-foreground mb-1 px-1 gap-0.5">
          <span className="flex-1 min-w-0" />
          <span className="w-11 text-right">Выр.</span>
          <span className="w-8 text-right">Чек.</span>
          <span className="w-9 text-right">Ср.чек</span>
          <span className="w-8 text-right">Возвр</span>
          <span className="w-7 text-right">Расх.</span>
          <span className="w-11 text-right">Прибыль</span>
        </div>

        <div className="space-y-1">
          {sorted.map((shop, i) => {
            const maxNet = sorted[0]?.netRevenue || 1;
            const maxChecks = Math.max(...sorted.map(s => s.checks), 1);
            const maxAvg = Math.max(...sorted.map(s => s.averageCheck), 1);
            const sm = marginMap.get(shop.name);
            const maxProfit = Math.max(...sorted.map(s => marginMap.get(s.name)?.profit ?? 0), 1);
            const expRatio = shop.revenue > 0 ? shop.expenses / shop.revenue : 0;

            const metrics = [
              { val: shop.netRevenue, max: maxNet, fmt: formatRub(shop.netRevenue), w: 44 },
              { val: shop.checks, max: maxChecks, fmt: String(shop.checks), w: 32 },
              { val: shop.averageCheck, max: maxAvg, fmt: formatRub(shop.averageCheck), w: 36 },
              { val: shop.refundRate, max: Math.max(...sorted.map(s => s.refundRate), 1), fmt: `${shop.refundRate.toFixed(1)}%`, w: 32 },
              { val: expRatio, max: Math.max(...sorted.map(s => s.revenue > 0 ? s.expenses / s.revenue : 0), 0.01), fmt: `${(expRatio * 100).toFixed(0)}%`, w: 28 },
              { val: sm?.profit ?? 0, max: maxProfit, fmt: sm ? formatRub(sm.profit) : "—", w: 44 },
            ];

            return (
              <div key={shop.name} className="flex items-center gap-0.5 text-[10px]">
                <span className="flex-1 min-w-0 truncate flex items-center gap-1 text-foreground">
                  {i === 0 ? <Trophy className="w-3 h-3 text-yellow-500 shrink-0" /> :
                   i === 1 ? <Medal className="w-3 h-3 text-slate-400 shrink-0" /> :
                   i === 2 ? <Medal className="w-3 h-3 text-orange-400 shrink-0" /> :
                   <span className="w-3 text-[8px] text-muted-foreground text-center shrink-0">{i + 1}</span>}
                  <span className="font-medium truncate">{shop.name}</span>
                </span>
                {metrics.map((m, mi) => (
                  <div key={mi} className="relative rounded-full overflow-hidden bg-muted/40 h-3" style={{ width: m.w }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((m.val / m.max) * 100, 100)}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: mi === 5 && sm?.profit ? "hsl(var(--success))" : "hsl(var(--chart-2))", opacity: 0.4 }}
                    />
                    <div className="relative z-10 flex items-center justify-end h-full pr-1 text-[7px] text-foreground/80 tabular-nums font-medium">
                      {m.fmt}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Среднее */}
        <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground mt-1 pt-1 border-t border-border/50 px-1">
          <span className="flex-1">Среднее</span>
          <span className="w-11 text-right tabular-nums">{formatRub(avgNet)}</span>
          <span className="w-8 text-right tabular-nums">{Math.round(sorted.reduce((s, r) => s + r.checks, 0) / sorted.length)}</span>
          <span className="w-9 text-right tabular-nums">{formatRub(avgCheck)}</span>
          <span className="w-8 text-right tabular-nums">{avgRefund.toFixed(1)}%</span>
          <span className="w-7 text-right tabular-nums">{(avgExpRatio * 100).toFixed(0)}%</span>
          <span className="w-11 text-right tabular-nums">{formatRub(avgProfit)}</span>
        </div>
      </div>

      {/* Отстающие */}
      {lagging.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wider">
              Что подтянуть
            </span>
          </div>
          <div className="space-y-1.5">
            {lagging.map((shop) => {
              const sm = marginMap.get(shop.name);
              const hints: string[] = [];
              const expRatio = shop.revenue > 0 ? shop.expenses / shop.revenue : 0;
              if (sm && sm.profit < avgProfit * 0.5) hints.push("↑ прибыль");
              if (shop.averageCheck < avgCheck * 0.85) hints.push("↑ ср.чек");
              if (shop.refundRate > Math.max(avgRefund + 2, 4)) hints.push("↓ возвр.");
              if (expRatio > Math.max(avgExpRatio + 0.03, 0.08)) hints.push("↓ расх.");
              if (hints.length === 0) hints.push("✓ норма");

              return (
                <div key={shop.name} className="flex items-start gap-2 text-xs">
                  <span className="font-medium text-foreground shrink-0">{shop.name}:</span>
                  <span className="text-muted-foreground">{hints.join(" · ")}</span>
                </div>
              );
            })}
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
