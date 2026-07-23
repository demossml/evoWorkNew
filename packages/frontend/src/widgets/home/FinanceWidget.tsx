import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { useGrossProfit } from "@/hooks/dashboard/useGrossProfit";
import { FinancialReportDetails } from "@/widgets/dashboard/cards/FinancialReportDetails";
import { SkeletonCard } from "./widgetUtils";
import { ShoppingCart, ArrowDown, TrendingUp } from "lucide-react";

function formatRub(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("ru-RU");
}

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

  const sell = filtered.grandTotalSell ?? 0;
  const refund = filtered.grandTotalRefund ?? 0;
  const expenses = filtered.grandTotalCashOutcome ?? 0;
  const netRevenue = sell - refund - expenses;
  const profit = grossProfit?.total?.profit ?? 0;

  // ═══ Свёрнутая карточка ═══
  const card = (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer rounded-xl text-white shadow-lg relative overflow-hidden w-full"
      style={{ backgroundColor: "hsl(var(--warning))" }}
    >
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShoppingCart className="w-5 h-5 opacity-80 shrink-0" />
            <span className="text-xs font-medium opacity-90 truncate">Фин. отчёт</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <span className="text-[9px] opacity-50">Продажи {formatRub(sell)}</span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate leading-tight">{formatRub(netRevenue)} ₽</div>
            <div className="text-xs opacity-90 mt-1 truncate space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="opacity-70">Расходы {formatRub(expenses)}</span>
                {refund > 0 && <span className="opacity-70">· Возвраты {formatRub(refund)}</span>}
              </div>
              {profit > 0 && (
                <div className="flex items-center gap-1 text-emerald-200">
                  <TrendingUp className="w-3 h-3" />
                  Прибыль {formatRub(profit)} ₽
                </div>
              )}
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
      <FinancialReportDetails
        salesDataByShopName={filtered.salesDataByShopName}
        cashOutcomeData={filtered.cashOutcomeData}
        cashBalanceByShop={filtered.cashBalanceByShop}
        grandTotalSell={sell}
        grandTotalRefund={refund}
        grandTotalCashOutcome={expenses}
        totalCashBalance={filtered.totalCashBalance ?? 0}
        grossProfitByShop={grossProfit?.shops}
        totalGrossProfit={profit}
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
