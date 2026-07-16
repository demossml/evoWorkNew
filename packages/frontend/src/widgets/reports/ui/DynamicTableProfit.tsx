import React from "react";
import { DynamicTableProfitV2 } from "./DynamicTableProfitV2";

interface ProfitReport {
  period: { since: string; until: string };
  report: Record<string, { byCategory: Record<string, number>; totalEvoExpenses: number; expenses1C: number; grossProfit: number; netProfit: number }>;
}
interface ShopInfo { uuid: string; name: string; }
interface DynamicTableProfitProps { report: ProfitReport | null; shops: ShopInfo[] | undefined; }

export const DynamicTableProfit: React.FC<DynamicTableProfitProps> = (props) => (
  <DynamicTableProfitV2 {...props} />
);
