import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { useGrossProfit } from "@/hooks/dashboard/useGrossProfit";
import { ExpensesCard } from "@/widgets/dashboard/cards/ExpensesCard";
import { FinancialReportDetails } from "@/widgets/dashboard/cards/FinancialReportDetails";
import { SkeletonCard } from "./widgetUtils";
import { TileWrapper } from "./TileWrapper";

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function FinanceWidget({ since, until, expanded, onToggle }: Props) {
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const { data, loading, error } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);
  const { data: grossProfit } = useGrossProfit({ since, until });

  if (loading || !filtered) return <SkeletonCard tone="orange" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;

  const detail = (
    <FinancialReportDetails
      salesDataByShopName={filtered.salesDataByShopName}
      cashOutcomeData={filtered.cashOutcomeData}
      cashBalanceByShop={filtered.cashBalanceByShop}
      grandTotalSell={filtered.grandTotalSell}
      grandTotalRefund={filtered.grandTotalRefund}
      grandTotalCashOutcome={filtered.grandTotalCashOutcome}
      totalCashBalance={filtered.totalCashBalance}
      grossProfitByShop={grossProfit?.shops}
      totalGrossProfit={grossProfit?.total.profit}
    />
  );

  return (
    <TileWrapper
      expanded={expanded}
      onToggle={onToggle}
      card={
        <ExpensesCard
          value={filtered.grandTotalCashOutcome}
          onClick={() => {}}
          label="Фин. отчёт"
          cashBalanceByShop={filtered.cashBalanceByShop}
          salesDataByShopName={filtered.salesDataByShopName}
        />
      }
      detail={detail}
    />
  );
}
