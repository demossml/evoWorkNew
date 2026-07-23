import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDashboardHomeInsights } from "@/hooks/dashboard/useDashboardHomeInsights";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { BestShopDetails } from "@/widgets/dashboard/cards/BestShopDetails";
import type { LeaderMode } from "@/widgets/dashboard/cards/BestShopCard";
import { SkeletonCard } from "./widgetUtils";
import { Award, TrendingUp } from "lucide-react";

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
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
  const activeRows = mode === "week" ? bestShop.weekRows : bestShop.dayRows;
  const currentLeader = mode === "week" ? weekLeader : dayLeader;

  if (loading && !dayLeader && !weekLeader) return <SkeletonCard tone="purple" />;
  if (!dayLeader && !weekLeader) return <SkeletonCard tone="purple" />;

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
            <span className="text-xs font-medium opacity-90 truncate">Топ магазин</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            <button
              onClick={(e) => { e.stopPropagation(); setMode(mode === "day" ? "week" : "day"); }}
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-white/20 hover:bg-white/30 transition"
            >
              {mode === "day" ? "День" : "Неделя"}
            </button>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            {currentLeader ? (
              <>
                <div className="text-lg font-bold truncate leading-tight">{currentLeader.name}</div>
                <div className="text-sm opacity-90 mt-1 truncate flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {formatRub(currentLeader.netRevenue)} ₽
                </div>
              </>
            ) : (
              <div className="text-sm opacity-90">Нет данных</div>
            )}
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
      <BestShopDetails
        shops={activeRows}
        mode={mode}
        dayLeader={dayLeader}
        weekLeader={weekLeader}
        onModeChange={setMode}
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
