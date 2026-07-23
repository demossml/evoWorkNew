import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { SkeletonCard, EmptyTile } from "./widgetUtils";
import { Sparkline } from "@shared/ui";
import {
  Package, Trophy, Medal, TrendingUp, TrendingDown,
  BarChart3, AlertTriangle,
} from "lucide-react";
import type { ProductData } from "@/widgets/dashboard/type";

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

const HIGH_REFUND_THRESHOLD = 8;
const LOW_MARGIN_THRESHOLD = 20;

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function TopProductWidget({ since, until, expanded, onToggle }: Props) {
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const { data, loading } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);

  const top10 = useMemo(() => {
    if (!filtered?.topProducts?.length) return [];
    return [...filtered.topProducts]
      .sort((a, b) => b.netRevenue - a.netRevenue)
      .slice(0, 10);
  }, [filtered]);

  if (loading || !filtered) return <SkeletonCard tone="pink" />;
  if (!top10.length) return <EmptyTile title="Топ продукт" Icon={Package} />;

  const top1 = top10[0];
  const totalRev = top10.reduce((s, p) => s + p.netRevenue, 0);
  const maxRev = top1.netRevenue || 1;

  // ═══ Свёрнутая карточка ═══
  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full"
      style={{ backgroundColor: "hsl(var(--chart-5))" }}
    >
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Package className="w-5 h-5 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">Топ продукт</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <span className="text-[9px] opacity-50">Топ-10</span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate leading-tight" title={top1.productName}>
              {top1.productName}
            </div>
            <div className="text-lg font-bold mt-0.5">{formatRub(top1.netRevenue)} ₽</div>
            <div className="text-xs opacity-80 mt-0.5 flex items-center gap-2">
              <span>{top1.netQuantity} шт</span>
              <span>· маржа {top1.marginPct.toFixed(0)}%</span>
            </div>
          </div>
          {top1.dailyNetRevenue7?.length >= 2 && (
            <Sparkline values={top1.dailyNetRevenue7} width={48} height={18} className="text-white/60 shrink-0 mb-0.5" />
          )}
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
      {/* Заголовок */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-chart-5" />
        <h3 className="text-sm font-bold text-foreground">Топ-10 продуктов</h3>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-chart-5/10 p-2.5 text-center">
          <div className="text-sm font-bold text-foreground">{formatRub(totalRev)}</div>
          <div className="text-[10px] text-muted-foreground">Выручка топ-10</div>
        </div>
        <div className="rounded-xl bg-muted p-2.5 text-center">
          <div className="text-sm font-bold text-foreground">{top10.reduce((s, p) => s + p.netQuantity, 0)}</div>
          <div className="text-[10px] text-muted-foreground">Продано шт</div>
        </div>
        <div className="rounded-xl bg-muted p-2.5 text-center">
          <div className="text-sm font-bold text-foreground">
            {(top10.reduce((s, p) => s + p.marginPct * p.netRevenue, 0) / (totalRev || 1)).toFixed(0)}%
          </div>
          <div className="text-[10px] text-muted-foreground">Ср. маржа</div>
        </div>
      </div>

      {/* Список продуктов */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Продукты
        </h4>
        <div className="space-y-2">
          {top10.map((p, i) => {
            const barW = (p.netRevenue / maxRev) * 100;
            const hasRisk = p.refundRate > HIGH_REFUND_THRESHOLD || p.marginPct < LOW_MARGIN_THRESHOLD;

            return (
              <div key={p.productName}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-foreground font-medium truncate flex-1 flex items-center gap-1">
                    {i === 0 ? <Trophy className="w-3.5 h-3.5 text-yellow-500 shrink-0" /> :
                     i === 1 ? <Medal className="w-3.5 h-3.5 text-slate-400 shrink-0" /> :
                     i === 2 ? <Medal className="w-3.5 h-3.5 text-orange-400 shrink-0" /> :
                     <span className="w-3.5 text-[10px] text-muted-foreground text-center shrink-0">{i + 1}</span>}
                    {p.productName}
                    {hasRisk && <AlertTriangle className="w-3 h-3 text-warning shrink-0" />}
                  </span>
                  <span className="text-muted-foreground tabular-nums ml-2">{formatRub(p.netRevenue)} ₽</span>
                </div>
                <div className="h-4 rounded-full overflow-hidden flex bg-muted/50">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(barW, 100)}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: "hsl(var(--chart-5))" }}
                  />
                </div>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground mt-0.5 pl-5">
                  <span>{p.netQuantity} шт</span>
                  <span>маржа {p.marginPct.toFixed(0)}%</span>
                  {p.refundRate > 0 && <span className="text-destructive">возврат {p.refundRate.toFixed(1)}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div>
      <div onClick={onToggle}>{card}</div>
      <AnimatePresence>{expanded && detail}</AnimatePresence>
    </div>
  );
}
