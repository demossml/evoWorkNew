import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { TopProductCard, type TopProductMetricMode, type TopProductRefundFilter } from "@/widgets/dashboard/cards/TopProductCard";
import { TopProductsDetails } from "@/widgets/dashboard/cards/TopProductsDetails";
import { SkeletonCard, EmptyTile } from "./widgetUtils";
import { TileWrapper } from "./TileWrapper";
import { Package } from "lucide-react";

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function TopProductWidget({ since, until, expanded, onToggle }: Props) {
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const { data, loading } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);
  const metricMode: TopProductMetricMode = "revenue";
  const refundFilter: TopProductRefundFilter = "all";

  if (loading || !filtered) return <SkeletonCard tone="pink" />;
  if (!filtered.topProducts?.length) return <EmptyTile title="Топ продукт" Icon={Package} />;

  return (
    <TileWrapper
      expanded={expanded}
      onToggle={onToggle}
      card={<TopProductCard topProducts={filtered.topProducts} previousTopProducts={[]} metricMode={metricMode} refundFilter={refundFilter} onClick={() => {}} />}
      detail={<TopProductsDetails topProducts={filtered.topProducts} metricMode={metricMode} refundFilter={refundFilter} />}
    />
  );
}
