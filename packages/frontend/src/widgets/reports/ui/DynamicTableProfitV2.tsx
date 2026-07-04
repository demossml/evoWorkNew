import React, { Fragment, useState, useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";

interface ReportData {
  byCategory: Record<string, number>;
  totalEvoExpenses: number;
  expenses1C: number;
  grossProfit: number;
  netProfit: number;
}

interface ProfitReport {
  period: { since: string; until: string };
  report: Record<string, ReportData>;
}

interface ShopInfo {
  uuid: string;
  name: string;
}

interface TableRow {
  shopName: string;
  byCategory: Record<string, number>;
  totalEvoExpenses: number;
  expenses1C: number;
  grossProfit: number;
  netProfit: number;
}

interface DynamicTableProfitV2Props {
  report: ProfitReport | null;
  shops: ShopInfo[] | undefined;
}

const tableTranslations: { [key: string]: string } = {
  shopName: "Магазин",
  byCategory: "Расходы Evo (по категориям)",
  totalEvoExpenses: "Итого расходы Evo",
  expenses1C: "Расходы 1С",
  grossProfit: "Валовая прибыль",
  netProfit: "Чистая прибыль",
};

const INITIAL_CATEGORIES = 3;

export const DynamicTableProfitV2: React.FC<DynamicTableProfitV2Props> = ({
  report,
  shops,
}) => {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Omit<TableRow, "byCategory"> | null;
    direction: "asc" | "desc" | null;
  }>({ key: null, direction: null });

  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const toggleCategories = (idx: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const renderCategories = (byCategory: Record<string, number>, rowIdx: number) => {
    const entries = Object.entries(byCategory);
    if (entries.length === 0) return <span className="text-gray-400 dark:text-gray-500 text-xs">&mdash;</span>;
    const isExpanded = expandedCategories.has(rowIdx);
    const visible = isExpanded ? entries : entries.slice(0, INITIAL_CATEGORIES);
    const hiddenCount = entries.length - INITIAL_CATEGORIES;
    return (
      <>
        {visible.map(([cat, val]) => (
          <div key={cat} className="text-xs leading-relaxed">{cat}: {val.toLocaleString()} ₽</div>
        ))}
        {hiddenCount > 0 && (
          <button type="button" onClick={() => toggleCategories(rowIdx)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium mt-1">
            {isExpanded ? "▲ Свернуть" : `Ещё ${hiddenCount}`}
          </button>
        )}
      </>
    );
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  const tableData = React.useMemo(() => {
    if (!report || !shops) return [];
    const data: TableRow[] = Object.entries(report.report).map(([uuid, shopData]) => {
      const shopName = shops.find((s) => s.uuid === uuid)?.name || uuid;
      return { shopName, byCategory: shopData.byCategory, totalEvoExpenses: shopData.totalEvoExpenses, expenses1C: shopData.expenses1C, grossProfit: shopData.grossProfit, netProfit: shopData.netProfit };
    });
    const totals: TableRow = { shopName: "Итого", byCategory: {}, totalEvoExpenses: 0, expenses1C: 0, grossProfit: 0, netProfit: 0 };
    for (const shopData of Object.values(report.report)) {
      totals.totalEvoExpenses += shopData.totalEvoExpenses;
      totals.expenses1C += shopData.expenses1C;
      totals.grossProfit += shopData.grossProfit;
      totals.netProfit += shopData.netProfit;
      for (const [cat, val] of Object.entries(shopData.byCategory)) {
        if (!totals.byCategory[cat]) totals.byCategory[cat] = 0;
        totals.byCategory[cat] += val;
      }
    }
    return [...data, totals];
  }, [report, shops]);

  const sortedData = React.useMemo(() => {
    if (tableData.length === 0) return [];
    const totalRow = tableData[tableData.length - 1];
    const sortableRows = tableData.slice(0, tableData.length - 1);
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      sortableRows.sort((a, b) => {
        if (a[key] < b[key]) return sortConfig.direction === "asc" ? -1 : 1;
        if (a[key] > b[key]) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return [...sortableRows, totalRow];
  }, [tableData, sortConfig]);

  const handleSort = (key: keyof Omit<TableRow, "byCategory">) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  if (!report || !shops) return null;

  const tableKeys: (keyof TableRow)[] = ["shopName", "totalEvoExpenses", "expenses1C", "grossProfit", "netProfit", "byCategory"];

  return (
    <div className="w-full min-h-screen bg-white dark:bg-gray-900 px-2 sm:px-4 py-2 rounded-2xl">
      <motion.div style={{ scaleX, transformOrigin: "0%" }} className="h-1 bg-blue-500 mb-2 rounded-full" />

      {/* === ДЕСКТОП === */}
      <div className="hidden sm:block relative" ref={scrollRef} style={{ maxHeight: "calc(100vh - 4rem)", overflowY: "auto", overflowX: "auto" }}>
        <table className="w-full table-auto bg-white dark:bg-gray-900 rounded-lg shadow-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              {tableKeys.map((key) => (
                <th key={key}
                  className={`px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-300 ${key !== "byCategory" ? "cursor-pointer hover:text-blue-600 dark:hover:text-blue-400" : ""}`}
                  onClick={() => { if (key !== "byCategory") handleSort(key); }}>
                  {tableTranslations[key] || key}{" "}
                  {key !== "byCategory" && sortConfig.key === key ? (sortConfig.direction === "asc" ? "▲" : "▼") : key !== "byCategory" ? "↕" : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => {
              const isTotalRow = row.shopName === "Итого";
              return (
                <Fragment key={idx}>
                  <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx < 12 ? idx * 0.03 : 0, ease: "easeInOut" }}
                    className={`border-b border-gray-100 dark:border-gray-800 ${isTotalRow ? "font-bold bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}>
                    <td className="px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">{row.shopName}</td>
                    <td className="px-3 sm:px-4 py-2.5 text-right text-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">{row.totalEvoExpenses.toLocaleString()} ₽</td>
                    <td className="px-3 sm:px-4 py-2.5 text-right text-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">{row.expenses1C.toLocaleString()} ₽</td>
                    <td className="px-3 sm:px-4 py-2.5 text-right text-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">{row.grossProfit.toLocaleString()} ₽</td>
                    <td className="px-3 sm:px-4 py-2.5 text-right text-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">{row.netProfit.toLocaleString()} ₽</td>
                    <td className="px-3 sm:px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400">{renderCategories(row.byCategory, idx)}</td>
                  </motion.tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === МОБИЛЬНЫЕ КАРТОЧКИ === */}
      <div className="block sm:hidden space-y-3 px-2 py-2 max-h-[calc(100vh-4rem)] overflow-y-auto">
        {sortedData.map((row, idx) => {
          const isTotalRow = row.shopName === "Итого";
          return (
            <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx < 12 ? idx * 0.03 : 0 }}
              className={`p-4 rounded-xl shadow-sm ${isTotalRow ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-600" : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"}`}>
              <div className="mb-3 text-[15px] font-semibold text-gray-900 dark:text-gray-100">{row.shopName}</div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{tableTranslations.totalEvoExpenses}</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{row.totalEvoExpenses.toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{tableTranslations.expenses1C}</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{row.expenses1C.toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{tableTranslations.grossProfit}</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{row.grossProfit.toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{tableTranslations.netProfit}</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{row.netProfit.toLocaleString()} ₽</span>
                </div>
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{tableTranslations.byCategory}:</span>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {renderCategories(row.byCategory, idx)}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
