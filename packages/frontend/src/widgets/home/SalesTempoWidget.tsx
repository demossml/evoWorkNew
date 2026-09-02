import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { useAccessoriesSales } from "@/hooks/dashboard/useAccessoriesSales";
import { useMe } from "@/hooks/useApi";
import { useProductProfile } from "@/hooks/useProductProfile";
import { RevenueTempoDetails } from "@/widgets/dashboard/cards/RevenueTempoCard";
import { getAuthHeaders } from "@shared/api";
import { SkeletonCard } from "./widgetUtils";
import { Clock3, TrendingUp, TrendingDown } from "lucide-react";
import { type ReactNode } from "react";

function formatRub(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("ru-RU");
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function SalesTempoWidget({ since, until, expanded, onToggle }: Props) {
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;
  const me = useMe();
  const { isUniversal } = useProductProfile();

  // vape: темп к плану дня (план-факт по часам)
  const { data: planFact } = useQuery<any>({
    queryKey: ["hourly-plan-fact", since],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/revenue/hourly-plan-fact?date=${since}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled: !isUniversal,
    staleTime: 60_000,
  });

  // universal: сегодня vs вчера
  const { data: dayCompare } = useQuery<any>({
    queryKey: ["day-compare", localToday()],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/revenue/day-compare?date=${localToday()}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled: isUniversal,
    staleTime: 60_000,
  });

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
    enabled: expanded && !isUniversal,
  });

  if (loading || !filtered) return <SkeletonCard tone="indigo" />;

  // Данные карточки зависят от режима профиля
  let title: string;
  let mainValue: string;
  let secondary: ReactNode;
  let bgColor: string;

  if (isUniversal) {
    const dc = dayCompare ?? { currentNet: 0, deltaPct: 0 };
    const deltaUp = (dc.deltaPct ?? 0) >= 0;
    title = "Динамика";
    mainValue = `${formatRub(dc.currentNet ?? 0)} ₽`;
    bgColor = deltaUp ? "hsl(var(--success))" : "hsl(var(--destructive))";
    secondary = (
      <span className="flex items-center gap-1">
        {deltaUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        к вчера {deltaUp ? "+" : ""}{dc.deltaPct ?? 0}%
      </span>
    );
  } else {
    const pf = planFact ?? { actualNet: filtered.netRevenue, totalPlan: 0, planPct: 0, gapByNow: 0 };
    const hasPlan = (pf.totalPlan ?? 0) > 0;
    const gap = pf.gapByNow ?? 0;
    const gapUp = gap >= 0;
    title = "Темп";
    bgColor = !hasPlan
      ? "hsl(var(--muted-foreground))"
      : gapUp
        ? "hsl(var(--success))"
        : "hsl(var(--destructive))";
    if (hasPlan) {
      mainValue = `${gapUp ? "+" : "−"}${formatRub(Math.abs(gap))} ₽`;
      const pct = pf.planPct ?? 0;
      secondary = (
        <span className="flex items-center gap-1">
          {gapUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {gapUp ? "опереж." : "отстаём"} · план {pct > 200 ? ">200%" : `${pct}%`}
        </span>
      );
    } else {
      mainValue = `${formatRub(pf.actualNet ?? filtered.netRevenue)} ₽`;
      secondary = <span>План не задан</span>;
    }
  }

  // ═══ Свёрнутая карточка ═══
  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full h-full min-h-[132px] flex flex-col justify-between"
      style={{ backgroundColor: bgColor }}
    >
      <div className="relative p-4 flex-1 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock3 className="w-5 h-5 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">{title}</span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate leading-tight">{mainValue}</div>
            <div className="text-xs opacity-90 mt-1 truncate">{secondary}</div>
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
      {isUniversal ? (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground">Динамика к вчера</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-muted p-3">
              <div className="text-[10px] text-muted-foreground">Сегодня</div>
              <div className="text-lg font-bold text-foreground">{formatRub(dayCompare?.currentNet ?? 0)} ₽</div>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <div className="text-[10px] text-muted-foreground">Вчера</div>
              <div className="text-lg font-bold text-foreground">{formatRub(dayCompare?.previousNet ?? 0)} ₽</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {dayCompare?.previousDate} → {dayCompare?.date} · Δ {(dayCompare?.deltaPct ?? 0) >= 0 ? "+" : ""}{dayCompare?.deltaPct ?? 0}%
          </p>
        </div>
      ) : (
        <RevenueTempoDetails
          since={since}
          currentData={filtered}
          previousData={prevFiltered}
          accessoriesData={accessories.data}
          showAccessories
        />
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
