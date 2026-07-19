import React from "react";
import { motion } from "framer-motion";

type SalesReportRow = {
  productName: string;
  quantitySale: number;
  sum: number;
  costTotal?: number;
  profit?: number;
};

type SortKey = "productName" | "quantitySale" | "sum" | "profit";
type SortDirection = "asc" | "desc";

interface DynamicTableSalesReportV2Props {
  data: SalesReportRow[];
  showProfit?: boolean;
}

const formatNumber = (value: number) => value.toLocaleString("ru-RU");

export const DynamicTableSalesReportV2: React.FC<
  DynamicTableSalesReportV2Props
> = ({ data, showProfit }) => {
  const defaultSort = showProfit ? "profit" as SortKey : "sum" as SortKey;
  const [sortKey, setSortKey] = React.useState<SortKey>(defaultSort);
  const [sortDirection, setSortDirection] =
    React.useState<SortDirection>("desc");

  // Reset sort when switching between revenue/profit
  React.useEffect(() => {
    setSortKey(defaultSort);
    setSortDirection("desc");
  }, [showProfit]);

  const sortedData = React.useMemo(() => {
    const next = [...data];
    next.sort((a, b) => {
      if (sortKey === "productName") {
        const cmp = a.productName.localeCompare(b.productName, "ru");
        return sortDirection === "asc" ? cmp : -cmp;
      }
      const left = sortKey === "profit" ? (a.profit ?? 0) : (a[sortKey as "quantitySale" | "sum"] ?? 0);
      const right = sortKey === "profit" ? (b.profit ?? 0) : (b[sortKey as "quantitySale" | "sum"] ?? 0);
      return sortDirection === "asc" ? left - right : right - left;
    });
    return next;
  }, [data, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortDirection === "desc" ? "▼" : "▲";
  };

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Нет данных по выбранным параметрам.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Column headers — aligned with data columns */}
      <div className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur-sm app-safe-top">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => handleSort("productName")}
            className="flex-1 min-w-0 text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Название {sortArrow("productName")}
          </button>
          <button
            type="button"
            onClick={() => handleSort("quantitySale")}
            className="w-[60px] shrink-0 text-right pr-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Шт {sortArrow("quantitySale")}
          </button>
          <button
            type="button"
            onClick={() => handleSort(showProfit ? "profit" : "sum")}
            className="w-[90px] shrink-0 text-right pr-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {showProfit ? "₽ приб." : "₽"} {sortArrow(showProfit ? "profit" : "sum")}
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sortedData.map((row, index) => (
            <motion.div
              key={`${row.productName}-${index}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.15,
                delay: index < 20 ? index * 0.01 : 0,
              }}
              className={index % 2 === 0 ? "bg-muted/20" : ""}
            >
              {/* Line 1: product name — full width */}
              <div className="px-3 pt-1.5 pb-0 text-[13px] leading-tight font-medium text-foreground">
                {row.productName}
              </div>

              {/* Line 2: metrics aligned to columns */}
              <div className="flex items-baseline pb-1.5">
                {/* Empty spacer matching name column */}
                <div className="flex-1 min-w-0 px-3" />
                {/* Quantity column */}
                <div className="w-[60px] shrink-0 text-right pr-3 text-[13px] font-semibold tabular-nums text-foreground">
                  {formatNumber(row.quantitySale)}
                </div>
                {/* Sum / Profit column */}
                <div className={`w-[90px] shrink-0 text-right pr-3 text-[13px] font-bold tabular-nums ${showProfit ? (row.profit && row.profit >= 0 ? "text-success" : "text-destructive") : "text-foreground"}`}>
                  {formatNumber(showProfit ? (row.profit ?? 0) : row.sum)}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
