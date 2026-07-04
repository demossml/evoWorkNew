import React, { useState, useEffect } from "react";
import { DynamicTableProfitV2 } from "./DynamicTableProfitV2";
import { DynamicTableProfitClassic } from "./DynamicTableProfitClassic";

interface ProfitReport {
  period: { since: string; until: string };
  report: Record<string, { byCategory: Record<string, number>; totalEvoExpenses: number; expenses1C: number; grossProfit: number; netProfit: number }>;
}
interface ShopInfo { uuid: string; name: string; }
interface DynamicTableProfitProps { report: ProfitReport | null; shops: ShopInfo[] | undefined; }

const STORAGE_KEY = "dynamic_table_profit_version";
type TV = "v2" | "classic";

export const DynamicTableProfit: React.FC<DynamicTableProfitProps> = (props) => {
  const [v, setV] = useState<TV>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "classic" ? "classic" : "v2"; } catch { return "v2"; }
  });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, v); } catch {} }, [v]);

  return (
    <div>
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <span className={`text-xs ${v === "v2" ? "text-gray-900 dark:text-gray-100 font-semibold" : "text-gray-400 dark:text-gray-500"}`}>Новый</span>
        <button type="button" onClick={() => setV(p => p === "v2" ? "classic" : "v2")}
          className={`relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors ${v === "classic" ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}>
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${v === "classic" ? "translate-x-5" : "translate-x-0"}`} />
        </button>
        <span className={`text-xs ${v === "classic" ? "text-gray-900 dark:text-gray-100 font-semibold" : "text-gray-400 dark:text-gray-500"}`}>Старый</span>
      </div>
      {v === "v2" ? <DynamicTableProfitV2 {...props} /> : <DynamicTableProfitClassic {...props} />}
    </div>
  );
};
