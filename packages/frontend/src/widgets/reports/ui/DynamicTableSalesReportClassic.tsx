import React from "react";
import { motion } from "framer-motion";

type SalesReportRow = {
  productName: string;
  quantitySale: number;
  sum: number;
};

type SortKey = "productName" | "quantitySale" | "sum";
type SortDirection = "asc" | "desc";

interface DynamicTableSalesReportProps {
  data: SalesReportRow[];
}

const formatNumber = (value: number) => value.toLocaleString("ru-RU");

export const DynamicTableSalesReportClassic: React.FC<DynamicTableSalesReportProps> = ({
  data,
}) => {
  const [sortKey, setSortKey] = React.useState<SortKey>("sum");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

  const sortedData = React.useMemo(() => {
    const next = [...data];
    next.sort((a, b) => {
      if (sortKey === "productName") {
        const cmp = a.productName.localeCompare(b.productName, "ru");
        return sortDirection === "asc" ? cmp : -cmp;
      }
      const left = a[sortKey];
      const right = b[sortKey];
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

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Нет данных по выбранным параметрам.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      <div className="sticky top-0 z-10 flex gap-2 border-b border-slate-200/70 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/90">
        <button
          type="button"
          onClick={() => handleSort("productName")}
          className={`rounded-full px-3 py-1.5 text-xs border transition ${
            sortKey === "productName"
              ? "border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
              : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
          }`}
        >
          Name {sortKey === "productName" ? (sortDirection === "desc" ? "▼" : "▲") : "↕"}
        </button>
        <button
          type="button"
          onClick={() => handleSort("quantitySale")}
          className={`rounded-full px-3 py-1.5 text-xs border transition ${
            sortKey === "quantitySale"
              ? "border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
              : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
          }`}
        >
          Количество {sortKey === "quantitySale" ? (sortDirection === "desc" ? "▼" : "▲") : "↕"}
        </button>
        <button
          type="button"
          onClick={() => handleSort("sum")}
          className={`rounded-full px-3 py-1.5 text-xs border transition ${
            sortKey === "sum"
              ? "border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
              : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
          }`}
        >
          Сумма {sortKey === "sum" ? (sortDirection === "desc" ? "▼" : "▲") : "↕"}
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
          {sortedData.map((row, index) => (
            <motion.div
              key={`${row.productName}-${index}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: index < 20 ? index * 0.01 : 0 }}
              className="px-4 py-3"
            >
              <div className="space-y-2">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {row.productName}
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Количество
                    </div>
                    <div className="text-sm text-slate-800 dark:text-slate-200">
                      {formatNumber(row.quantitySale)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Сумма
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatNumber(row.sum)} ₽
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
