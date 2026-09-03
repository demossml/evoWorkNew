import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { getAuthHeaders } from "@shared/api";
import { useEmployeeRole } from "@/hooks/useApi";
import { canSeeProfit } from "@features/dashboard/model/homePageModel";
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
  shopOptions?: Record<string, string>;
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
  const [scope, setScope] = useState<MarginScope>("high");
  const [shopId, setShopId] = useState<string>("all");
  const { data: roleData } = useEmployeeRole();
  const canSeeProfitValue = canSeeProfit(roleData?.employeeRole);

  const { data, isLoading: loading } = useQuery<HighMarginResponse>({
    queryKey: ["high-margin", since, until, shopId],
    queryFn: async () => {
      const qs = new URLSearchParams({ since, until, scope: "all" });
      if (shopId !== "all") qs.set("shopUuid", shopId);
      const res = await fetch(`/api/evotor/high-margin-products?${qs}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
  });

  const threshold = data?.threshold ?? 0;

  // high: маржа ≥ порога; low: < порога.
  const scopedItems = useMemo(() => {
    const all = data?.items ?? [];
    return all
      .filter((i) => (scope === "high" ? i.margin_pct >= threshold : i.margin_pct < threshold))
      .sort((a, b) => b.sum - a.sum);
  }, [data, scope, threshold]);

  const totalSum = useMemo(() => scopedItems.reduce((s, i) => s + i.sum, 0), [scopedItems]);
  const totalProfit = useMemo(() => scopedItems.reduce((s, i) => s + i.profit, 0), [scopedItems]);
  const overallMargin = totalSum > 0 ? Math.round((totalProfit / totalSum) * 100) : 0;

  const title = scope === "high" ? "Высокомаржинальные товары" : "Низкомаржинальные товары";
  // Для кассира — нейтральный текст без цифр порога/маржи.
  const hint = canSeeProfitValue
    ? (scope === "high" ? `маржа ≥ ${threshold}%` : `маржа < ${threshold}%`)
    : (scope === "high" ? "Топ маржи" : "Низкая маржа");

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
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full h-full flex flex-col gap-1.5 justify-start"
      style={{ backgroundColor: scope === "high" ? "hsl(var(--chart-4))" : "hsl(var(--chart-5))" }}
    >
      <div className="relative p-2.5 sm:p-3 flex flex-col gap-1.5 justify-start">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            <TrendingUp className="w-4 h-4 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">{title}</span>
          </div>
          <span className="text-[9px] opacity-50 shrink-0 ml-1">{hint}</span>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold tabular-nums truncate leading-tight">{fmtRub(totalSum)} ₽</div>
            <div className="text-xs opacity-90 mt-0.5 truncate flex items-center gap-2">
              <span>{scopedItems.length} поз.</span>
              {canSeeProfitValue && (
                <span className="opacity-80">· маржа {overallMargin}%</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const detail = (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TrendingUp className="w-4 h-4 text-chart-4 shrink-0" />
          <h3 className="text-sm font-bold text-foreground truncate">{title}</h3>
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {toggle}
          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="h-7 max-w-[104px] truncate rounded-md border border-border bg-card px-1.5 text-[11px] text-foreground"
          >
            <option value="all">Все магазины</option>
            {Object.entries(data?.shopOptions ?? {}).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm font-bold text-foreground">{fmtRub(totalSum)} ₽</span>
        <span>· {scopedItems.length} поз.</span>
        {canSeeProfitValue && <span>· маржа {overallMargin}%</span>}
      </div>

      {scopedItems.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          Нет товаров {canSeeProfitValue
            ? (scope === "high" ? `с маржой ≥ ${threshold}%` : `с маржой < ${threshold}%`)
            : (scope === "high" ? "с высокой маржой" : "с низкой маржой")} за период
        </div>
      ) : (
        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {scopedItems.map((item, idx) => {
            const maxSum = scopedItems[0]?.sum || 1;
            const barW = (item.sum / maxSum) * 100;
            const marginColor = item.margin_pct > threshold ? "text-emerald-500" : "text-amber-500";
            return (
              <div key={`${item.name}-${idx}`} className="py-1.5 border-b border-border last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-foreground leading-snug break-words min-w-0 line-clamp-2">
                    {item.name}
                  </span>
                  <span className="text-foreground tabular-nums ml-2 text-xs font-semibold shrink-0">
                    {fmtRub(item.sum)} ₽
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex bg-muted/50 mt-1">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(barW, 100)}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: "hsl(var(--chart-4))", opacity: 0.4 }}
                  />
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span className="text-foreground font-medium">{item.quantity} шт</span>
                  {canSeeProfitValue && (
                    <span className={`font-semibold tabular-nums ${marginColor}`}>
                      маржа {item.margin_pct.toFixed(1)}%
                    </span>
                  )}
                  {canSeeProfitValue && (
                    <span className="text-foreground/70 tabular-nums">приб. {fmtRub(item.profit)} ₽</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );

  return (
    <div className={expanded ? "" : "h-full"}>
      <div onClick={onToggle} className={expanded ? "" : "h-full"}>{card}</div>
      <AnimatePresence>{expanded && detail}</AnimatePresence>
    </div>
  );
}
