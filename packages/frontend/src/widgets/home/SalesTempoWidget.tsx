import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { RevenueTempoCard } from "@/widgets/dashboard/cards/RevenueTempoCard";
import { RevenueTempoDetails } from "@/widgets/dashboard/cards/RevenueTempoCard";
import { useAccessoriesSales } from "@/hooks/dashboard/useAccessoriesSales";
import { useMe } from "@/hooks/useApi";
import { SkeletonCard } from "./widgetUtils";
import { TileWrapper } from "./TileWrapper";

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

  const accessories = useAccessoriesSales({ role: role?.employeeRole || "CASHIER", userId: me.data?.id ?? "", since, until, enabled: expanded });

  if (loading || !filtered) return <SkeletonCard tone="indigo" />;

  const salesDeltaPct = prevFiltered?.netRevenue
    ? Math.round(((filtered.netRevenue - prevFiltered.netRevenue) / prevFiltered.netRevenue) * 100) : 0;

  return (
    <TileWrapper
      expanded={expanded}
      onToggle={onToggle}
      ringTone="slate"
      card={<RevenueTempoCard salesDeltaPct={salesDeltaPct} onClick={() => {}} pace={0} />}
      detail={
        <RevenueTempoDetails since={since} currentData={filtered} previousData={prevFiltered} accessoriesData={accessories.data} />
      }
    />
  );
}
