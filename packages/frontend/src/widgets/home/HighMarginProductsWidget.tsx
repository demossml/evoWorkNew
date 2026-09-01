import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { getAuthHeaders } from "@shared/api";
import { SkeletonCard } from "./widgetUtils";

interface HighMarginItem {
  name: string;
  sum: number;
  quantity: number;
  cost: number;
  profit: number;
  margin_pct: number;
}

interface HighMarginResponse {
  threshold: number;
  items: HighMarginItem[];
}

type MarginScope = "high" | "low";

interface Props {
  since: string;
  until: string;
  expanded: boolean;
  onToggle: () => void;
}

function fmtRub(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

export function HighMarginProductsWidget({ since, until, expanded, onToggle }: Props) {
  const [data, setData] = useState<HighMarginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<MarginScope>("high");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const qs = new URLSearchParams({ since, until });
        const res = await fetch(`/api/evotor/high-margin-products?${qs}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as HighMarginResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [since, until]);

  const threshold = data?.threshold ?? 0;

  // high: маржа строго выше порога; low: ≤ порога.
  const scopedItems = useMemo(() => {
    const all = data?.items ?? [];
    return all
      .filter((i) => (scope === "high" ? i.margin_pct > threshold : i.margin_pct <= threshold))
      .sort((a, b) => b.sum - a.sum);
  }, [data, scope, threshold]);

  const totalSum = useMemo(() => scopedItems.reduce((s, i) => s + i.sum, 0), [scopedItems]);
  const totalProfit = useMemo(() => scopedItems.reduce((s, i) => s + i.profit, 0), [scopedItems]);
  const overallMargin = totalSum > 0 ? Math.round((totalProfit / totalSum) * 100) : 0;

  const title = scope === "high" ? "Высокомаржинальные товары" : "Низкомаржинальные товары";
  const hint = scope === "high" ? `маржа > ${threshold}%` : `маржа ≤ ${threshold}%`;

  const toggle = (
    <div
      className="inline-flex rounded-md border border-border p-0.5 text-[10px]"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={`rounded px-2 py-0.5 ${scope === "high" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        onClick={() => setScope("high")}
      >
        Высокая маржа
      </button>
      <button
        className={`rounded px-2 py-0.5 ${scope === "low" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        onClick={() => setScope("low")}
      >
        Низкая маржа
      </button>
    </div>
  );

  if (loading) return <SkeletonCard tone="emerald" />;

  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full"
      style={{ backgroundColor: scope === "high" ? "hsl(var(--chart-4))" : "hsl(var(--chart-5))" }}
    >
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <TrendingUp className="w-5 h-5 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">{title}</span>
          </div>
          <span className="text-[9px] opacity-50 shrink-0 ml-1">{hint}</span>
        </div>
        <div className="flex items-end justify-between gap-1.5 mb-2">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate leading-tight">{fmtRub(totalSum)} ₽</div>
            <div className="text-xs opacity-90 mt-1 truncate flex items-center gap-2">
              <span>{scopedItems.length} поз.</span>
              <span className="opacity-80">· маржа {overallMargin}%</span>
            </div>
          </div>
        </div>
        {toggle}
      </div>
    </motion.div>
  );

  const detail = (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3 max-h-[55vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-chart-4" />
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
        </div>
        {toggle}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted p-2.5 text-center">
          <div className="text-sm font-bold text-foreground">{fmtRub(totalSum)}</div>
          <div className="text-[10px] text-muted-foreground">Выручка</div>
        </div>
        <div className="rounded-xl bg-muted p-2.5 text-center">
          <div className="text-sm font-bold text-foreground">{scopedItems.length}</div>
          <div className="text-[10px] text-muted-foreground">Позиций</div>
        </div>
        <div className="rounded-xl bg-muted p-2.5 text-center">
          <div className="text-sm font-bold text-emerald-500">{overallMargin}%</div>
          <div className="text-[10px] text-muted-foreground">Маржа</div>
        </div>
      </div>

      {scopedItems.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          Нет товаров с маржой {scope === "high" ? `выше ${threshold}%` : `не выше ${threshold}%`} за период
        </div>
      ) : (
        <div className="space-y-2">
          {scopedItems.map((item, idx) => {
            const maxSum = scopedItems[0]?.sum || 1;
            const barW = (item.sum / maxSum) * 100;
            const marginColor = item.margin_pct > threshold ? "text-emerald-500" : "text-amber-500";
            return (
              <div key={`${item.name}-${idx}`} className="pb-2 border-b border-border last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-foreground leading-snug break-words min-w-0">
                    {item.name}
                  </span>
                  <span className="text-foreground tabular-nums ml-2 text-xs font-semibold shrink-0">
                    {fmtRub(item.sum)} ₽
                  </span>
                </div>
                <div className="h-3.5 rounded-full overflow-hidden flex bg-muted/50 mt-1">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(barW, 100)}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: "hsl(var(--chart-4))", opacity: 0.4 }}
                  />
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1 flex-wrap">
                  <span className="text-foreground font-medium">{item.quantity} шт</span>
                  <span className={`font-semibold tabular-nums ${marginColor}`}>
                    маржа {item.margin_pct.toFixed(1)}%
                  </span>
                  <span className="text-foreground/70 tabular-nums">приб. {fmtRub(item.profit)} ₽</span>
                </div>
              </div>
            );
          })}
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
