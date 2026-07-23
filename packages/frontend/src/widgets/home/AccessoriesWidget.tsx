import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cherry, Package, BarChart3 } from "lucide-react";
import { useAccessoriesSales, type AccessoriesSalesData } from "@/hooks/dashboard/useAccessoriesSales";
import { useEmployeeRole, useMe } from "@/hooks/useApi";
import { SkeletonCard } from "./widgetUtils";
import { buildAccessoriesSummaryStats } from "@features/dashboard/model/dashboardSummaryModel";

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function AccessoriesWidget({ since, until, expanded, onToggle }: Props) {
  const [shopFilter, setShopFilter] = useState("all");
  const [scope, setScope] = useState<"accessories" | "nonAccessories">("accessories");
  const { data: role } = useEmployeeRole();
  const me = useMe();
  const { data, loading, error } = useAccessoriesSales({
    role: role?.employeeRole || "CASHIER",
    userId: me.data?.id ?? "",
    since, until,
    enabled: true,
  });

  const shopOptions = useMemo(() => {
    const names = new Set<string>();
    data?.total?.forEach((i: any) => { if (i.shopName) names.add(i.shopName); });
    return Array.from(names);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (shopFilter === "all") return data;
    return {
      ...data,
      total: data.total.filter((i: any) => i.shopName === shopFilter),
      nonAccessoriesTotal: (data.nonAccessoriesTotal || []).filter((i: any) => i.shopName === shopFilter),
    };
  }, [data, shopFilter]);

  const tileValue = useMemo(() => {
    if (!filtered) return 0;
    const list = scope === "nonAccessories" ? (filtered.nonAccessoriesTotal || []) : filtered.total;
    return list.reduce((s: number, i: any) => s + i.sum, 0);
  }, [filtered, scope]);

  if (loading || !filtered) return <SkeletonCard tone="blue" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;

  const stats = buildAccessoriesSummaryStats(data!, scope);

  // ═══ Свёрнутая карточка ═══
  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full"
      style={{ backgroundColor: "hsl(var(--chart-1))" }}
    >
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Cherry className="w-5 h-5 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">Аксессуары</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <span className="text-[9px] opacity-50">{stats.totalProducts} тов.</span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate leading-tight">{formatRub(tileValue)} ₽</div>
            <div className="text-sm opacity-90 mt-1 truncate">
              Продано {stats.totalQty} шт · ср. цена {stats.avgPrice} ₽
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );

  // ═══ Развёрнутый вид ═══
  const sourceList = scope === "nonAccessories" ? (filtered.nonAccessoriesTotal || []) : filtered.total;
  const sorted = [...sourceList].sort((a: any, b: any) => b.sum - a.sum);

  const detail = (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3 max-h-[55vh] overflow-y-auto"
    >
      {/* Заголовок + фильтры */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-chart-1" />
          <h3 className="text-sm font-bold text-foreground">Продажи аксессуаров</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5 text-[10px]">
            <button
              className={`rounded px-2 py-0.5 ${scope === "accessories" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setScope("accessories")}
            >Акс.</button>
            <button
              className={`rounded px-2 py-0.5 ${scope === "nonAccessories" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setScope("nonAccessories")}
            >Не акс.</button>
          </div>
          {shopOptions.length > 1 && (
            <select
              className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground"
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
            >
              <option value="all">Все</option>
              {shopOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-chart-1/10 p-2.5 text-center">
          <div className="text-sm font-bold text-foreground">{formatRub(tileValue)}</div>
          <div className="text-[10px] text-muted-foreground">Сумма</div>
        </div>
        <div className="rounded-xl bg-muted p-2.5 text-center">
          <div className="text-sm font-bold text-foreground">{stats.totalQty}</div>
          <div className="text-[10px] text-muted-foreground">Продано шт</div>
        </div>
        <div className="rounded-xl bg-muted p-2.5 text-center">
          <div className="text-sm font-bold text-foreground">{stats.topShare}%</div>
          <div className="text-[10px] text-muted-foreground">Доля топ-3</div>
        </div>
      </div>

      {/* Список товаров */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Товары ({sorted.length})
        </h4>
        <div className="space-y-1.5">
          {sorted.map((sale: any, idx: number) => (
            <div key={sale.name} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
              <span className="text-foreground truncate flex-1 flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground w-4 text-right">{idx + 1}.</span>
                {sale.name}
              </span>
              <span className="text-muted-foreground tabular-nums ml-2">
                {formatRub(sale.sum)} ₽
                <span className="text-[10px] ml-1">({sale.quantity} шт)</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* По магазинам */}
      {stats.byShop.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            По магазинам
          </h4>
          <div className="space-y-1">
            {stats.byShop.map((shop) => (
              <div key={shop.shopName} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate">{shop.shopName}</span>
                <span className="text-muted-foreground tabular-nums">{formatRub(shop.sum)} ₽</span>
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
