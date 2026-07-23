import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { useAccessoriesSales } from "@/hooks/dashboard/useAccessoriesSales";
import { useMe } from "@/hooks/useApi";
import { RevenueTempoDetails } from "@/widgets/dashboard/cards/RevenueTempoCard";
import { SkeletonCard } from "./widgetUtils";
import { Clock3, TrendingUp, TrendingDown } from "lucide-react";

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function SalesTempoWidget({ since, until, expanded, onToggle }: Props) {
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;
  const me = useMe();

  const { data, loading } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);

  const prevUntil = new Date(since);
  prevUntil.setDate(prevUntil.getDate() - 1);
  const prevSince = new Date(prevUntil);
  prevSince.setDate(prevSince.getDate() - (new Date(until).getDate() - new Date(since).getDate()));
  const prevS = prevSince.toISOString().slice(0, 10);
  const prevU = prevUntil.toISOString().slice(0, 10);
  const prevData = useSalesData({ since: prevS, until: prevU, shopUuid, enabled: true, pollIntervalMs: 0 });
  const prevFiltered = useFilteredSalesData(prevData.data, isSuperAdmin, ws ?? null);

  const accessories = useAccessoriesSales({
    role: role?.employeeRole || "CASHIER",
    userId: me.data?.id ?? "",
    since, until,
    enabled: expanded,
  });

  if (loading || !filtered) return <SkeletonCard tone="indigo" />;

  const salesDeltaPct = prevFiltered?.netRevenue
    ? Math.round(((filtered.netRevenue - prevFiltered.netRevenue) / prevFiltered.netRevenue) * 100)
    : 0;

  const deltaUp = salesDeltaPct >= 0;
  const bgColor = deltaUp
    ? "hsl(var(--success))"
    : salesDeltaPct >= -10
      ? "hsl(var(--warning))"
      : "hsl(var(--destructive))";

  // ═══ Свёрнутая карточка ═══
  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full"
      style={{ backgroundColor: bgColor }}
    >
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock3 className="w-5 h-5 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">Темп продаж</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20">
              {deltaUp ? "+" : ""}{salesDeltaPct}%
            </span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate leading-tight">
              {formatRub(filtered.netRevenue)} ₽
            </div>
            <div className="text-sm opacity-90 mt-1 truncate flex items-center gap-1">
              {deltaUp
                ? <><TrendingUp className="w-3.5 h-3.5" /> Растём к прошлому периоду</>
                : <><TrendingDown className="w-3.5 h-3.5" /> Падение к прошлому периоду</>
              }
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
      className="bg-card rounded-xl border border-border p-4 max-h-[55vh] overflow-y-auto"
    >
      <RevenueTempoDetails
        since={since}
        currentData={filtered}
        previousData={prevFiltered}
        accessoriesData={accessories.data}
      />
    </motion.div>
  );

  return (
    <div>
      <div onClick={onToggle}>{card}</div>
      <AnimatePresence>{expanded && detail}</AnimatePresence>
    </div>
  );
}
