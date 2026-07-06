import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useSalesCalculations } from "@/hooks/dashboard/useSalesCalculations";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { RevenueCard } from "@/widgets/dashboard/cards/RevenueCard";
import { RevenueDetailsAdmin } from "@/widgets/dashboard/cards/RevenueDetailsAdmin";
import { RevenueDetailsUser } from "@/widgets/dashboard/cards/RevenueDetailsUser";
import { SkeletonCard } from "@/widgets/home/widgetUtils";
import { TileWrapper } from "./TileWrapper";
import { useQuery } from "@tanstack/react-query";

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

async function fetchPlanToday(): Promise<{ totalPlan: number; totalVapeSales: number }> {
  const resp = await fetch("/api/evotor/plan-for-today");
  if (!resp.ok) return { totalPlan: 0, totalVapeSales: 0 };
  const raw = await resp.json();
  let totalPlan = 0;
  let totalVapeSales = 0;
  for (const shop of Object.values(raw.salesData || {}) as any[]) {
    totalPlan += shop.datePlan || 0;
    totalVapeSales += shop.dataSales || 0;
  }
  return { totalPlan, totalVapeSales };
}

export function RevenueWidget({ since, until, expanded, onToggle }: Props) {
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const { data, loading, error } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);
  const { netSales } = useSalesCalculations(filtered);

  const { data: planData } = useQuery({
    queryKey: ["planForToday"],
    queryFn: fetchPlanToday,
    staleTime: 60_000,
    refetchInterval: 180_000,
  });

  if (loading || !filtered) return <SkeletonCard tone="blue" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;

  const totalPlan = planData?.totalPlan || 0;
  const totalVapeSales = planData?.totalVapeSales || 0;
  const planPct = totalPlan > 0 ? Math.round((totalVapeSales / totalPlan) * 100) : undefined;

  const detail = isSuperAdmin ? (
    <RevenueDetailsAdmin
      salesDataByShopName={filtered.salesDataByShopName}
      grandTotalSell={filtered.grandTotalSell}
      grandTotalRefund={filtered.grandTotalRefund}
      netRevenue={filtered.netRevenue}
      averageCheck={filtered.averageCheck}
      totalChecks={filtered.totalChecks}
      since={since} until={until}
    />
  ) : (
    <RevenueDetailsUser salesDataByShopName={filtered.salesDataByShopName} />
  );

  return (
    <TileWrapper
      expanded={expanded}
      onToggle={onToggle}
      card={<RevenueCard value={netSales} percentPlan={planPct} onClick={() => {}} />}
      detail={detail}
    />
  );
}
