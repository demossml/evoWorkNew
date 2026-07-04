import { useDashboardHomeInsights } from "@/hooks/dashboard/useDashboardHomeInsights";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { BestShopCard, type LeaderMode } from "@/widgets/dashboard/cards/BestShopCard";
import { BestShopDetails } from "@/widgets/dashboard/cards/BestShopDetails";
import { SkeletonCard } from "./widgetUtils";
import { TileWrapper } from "./TileWrapper";
import { useState } from "react";

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

  if (loading && !dayLeader && !weekLeader) return <SkeletonCard tone="purple" />;
  if (!dayLeader && !weekLeader) return <SkeletonCard tone="purple" />;

  return (
    <TileWrapper
      expanded={expanded}
      onToggle={onToggle}
      ringTone="purple"
      card={<BestShopCard dayLeader={dayLeader} weekLeader={weekLeader} mode={mode} onClick={() => {}} />}
      detail={
        <BestShopDetails shops={activeRows} mode={mode} dayLeader={dayLeader} weekLeader={weekLeader} onModeChange={setMode} />
      }
    />
  );
}
