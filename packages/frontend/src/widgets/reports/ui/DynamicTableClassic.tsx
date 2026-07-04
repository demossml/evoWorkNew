import React, { Fragment, useRef, useState, useCallback } from "react";
import { motion, useScroll, useSpring } from "framer-motion";

interface TableData {
  [key: string]: string | number | string[];
}

interface DynamicTableProps {
  data: TableData[];
  columns?: string[];
}

const tableN: { [key: string]: string } = {
  shopName: "Магазин",
  productName: "Товар",
  smaQuantity: "Спрос/день",
  quantity: "Остаток",
  availableStock: "Доступный остаток",
  safetyStock: "Страх. запас",
  reorderPoint: "Точка заказа",
  targetStock: "Целевой остаток",
  quantitySale: "Количество",
  orderQuantity: "К заказу",
  confidencePct: "Доверие",
  reasonCodes: "Причины",
  sum: "Сумма",
};

const mobilePriorityColumns = [
  "smaQuantity",
  "quantity",
  "orderQuantity",
  "sum",
] as const;

const INITIAL_VISIBLE_ROWS = 120;
const LOAD_MORE_STEP = 120;

const reasonCodeLabel = (code: string) => {
  if (code === "LOW_STOCK") return "Низкий остаток";
  if (code === "NO_STOCK") return "Нет на складе";
  if (code === "HIGH_VARIABILITY") return "Высокая вариативность";
  if (code === "BUDGET_LIMIT") return "Ограничение бюджета";
  if (code === "HIGH_DEMAND") return "Высокий спрос";
  if (code === "STABLE") return "Стабильный спрос";
  if (code === "NEW_PRODUCT") return "Новый товар";
  if (code === "OVERSTOCK") return "Избыток";
  if (code === "NO_SALES") return "Нет продаж";
  if (code === "HIGH_VALUE") return "Высокая стоимость";
  if (code === "BALANCED") return "Норма";
  return code.replace(/_/g, " ");
};

export const DynamicTableClassic: React.FC<DynamicTableProps> = ({
  data,
  columns: columnsProp,
}) => {
  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: "asc" | "desc" | null;
  }>({
    key: "sum",
    direction: "desc",
  });

  const [visibleRowsCount, setVisibleRowsCount] =
    useState(INITIAL_VISIBLE_ROWS);

  const scrollRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    container: scrollRef,
  });
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  const sortedData = React.useMemo(() => {
    const sortableData = [...data];
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      sortableData.sort((a, b) => {
        const aValue = a[key];
        const bValue = b[key];

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc"
            ? aValue - bValue
            : bValue - aValue;
        }

        const aText = Array.isArray(aValue)
          ? aValue.join(", ")
          : String(aValue ?? "");
        const bText = Array.isArray(bValue)
          ? bValue.join(", ")
          : String(bValue ?? "");
        const compare = aText.localeCompare(bText, "ru");
        return sortConfig.direction === "asc" ? compare : -compare;
      });
    }
    return sortableData;
  }, [data, sortConfig]);

  React.useEffect(() => {
    setVisibleRowsCount(INITIAL_VISIBLE_ROWS);
  }, [sortedData.length, sortConfig.key, sortConfig.direction]);

  const hasMoreRows = visibleRowsCount < sortedData.length;
  const renderedRows = React.useMemo(
    () => sortedData.slice(0, visibleRowsCount),
    [sortedData, visibleRowsCount]
  );

  const loadMoreRows = React.useCallback(() => {
    setVisibleRowsCount((prev) =>
      Math.min(prev + LOAD_MORE_STEP, sortedData.length)
    );
  }, [sortedData.length]);

  const handleContainerScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!hasMoreRows) return;
      const el = event.currentTarget;
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom < 220) {
        loadMoreRows();
      }
    },
    [hasMoreRows, loadMoreRows]
  );

  const isNumericColumn = (key: string) =>
    data.some((row) => typeof row[key] === "number");

  const formatNumber = (value: number) => value.toLocaleString("ru-RU");

  const formatCellValue = (key: string, value: string | number | string[]) => {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value !== "number") return value;
    if (key === "sum") return `${formatNumber(value)} ₽`;
    if (key === "confidencePct") return `${value.toFixed(1)}%`;
    return formatNumber(value);
  };

  const valueToneClass = (
    key: string,
    value: string | number | string[] | undefined
  ) => {
    if (key === "confidencePct" && typeof value === "number") {
      if (value < 55) return "text-red-600 dark:text-red-400 font-semibold";
      if (value < 75) return "text-amber-600 dark:text-amber-400 font-semibold";
      return "text-emerald-600 dark:text-emerald-400 font-semibold";
    }
    if (key === "orderQuantity" && typeof value === "number" && value > 0) {
      return "text-blue-700 dark:text-blue-300 font-semibold";
    }
    if (key === "sum" && typeof value === "number" && value < 0) {
      return "text-red-600 dark:text-red-400";
    }
    return "text-gray-700 dark:text-gray-300";
  };

  const reasonBadgeClass = (code: string) => {
  if (code === "LOW_STOCK") {
    return "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200";
  }
  if (code === "HIGH_VARIABILITY") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200";
  }
  if (code === "BUDGET_LIMIT") {
    return "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200";
  }
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200";
  };

  const renderReasonCodes = (value: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {value.length > 0 ? (
        value.map((code) => (
          <span
            key={code}
            className={`rounded-full px-2 py-1 text-xs font-semibold ${reasonBadgeClass(code)}`}
          >
            {reasonCodeLabel(code)}
          </span>
        ))
      ) : (
        <span className="text-gray-400 dark:text-gray-500">—</span>
      )}
    </div>
  );

  const handleSort = (key: string) => {
    if (sortConfig.key === key) {
      setSortConfig({
        key,
        direction: sortConfig.direction === "desc" ? "asc" : "desc",
      });
      return;
    }
    setSortConfig({ key, direction: "desc" });
  };

  const columns =
    columnsProp && columnsProp.length > 0
      ? columnsProp
      : Object.keys(data[0] || {});
  if (columns.length === 0) {
    return (
      <div className="w-full rounded-xl bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        Нет данных для отображения.
      </div>
    );
  }

  const mobileSortColumns = columns.filter((key) => key !== "productName");

  return (
    <div className="w-full rounded-2xl min-h-screen bg-custom-gray dark:bg-gray-900 px-2 sm:px-4">
      <motion.div
        style={{ scaleX, transformOrigin: "0%" }}
        className="h-1 bg-blue-500 mb-2 rounded-full"
      />

      <div
        className="lg:hidden space-y-2 pb-20 max-h-[calc(100vh-4rem)] overflow-y-auto"
        onScroll={handleContainerScroll}
      >
        <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {mobileSortColumns.map((key) => {
              const isActive = sortConfig.key === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSort(key)}
                  className={`rounded-full px-3 py-1.5 text-xs border transition ${
                    isActive
                      ? "border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                      : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  }`}
                >
                  {tableN[key] || key}
                  {isActive
                    ? sortConfig.direction === "asc"
                      ? " ▲"
                      : " ▼"
                    : " ↕"}
                </button>
              );
            })}
          </div>
        </div>

        {renderedRows.map((row, rowIndex) => {
          const productName =
            typeof row.productName === "string" ? row.productName : "Товар";
          const reasons = Array.isArray(row.reasonCodes) ? row.reasonCodes : [];
          const animationDelay = rowIndex < 20 ? rowIndex * 0.012 : 0;

          return (
            <motion.article
              key={`${productName}-${rowIndex}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: animationDelay }}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3"
            >
              {row.shopName && typeof row.shopName === "string" && (
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">
                  {row.shopName}
                </p>
              )}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {productName}
                </h3>
                {typeof row.confidencePct === "number" && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 ${valueToneClass("confidencePct", row.confidencePct)}`}
                  >
                    {formatCellValue("confidencePct", row.confidencePct)}
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3 py-2">
                {mobilePriorityColumns.map((key) => {
                  const value = row[key];
                  return (
                    <div key={key} className={key === "sum" ? "text-right" : ""}>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tableN[key]}
                      </p>
                      <p
                        className={`text-sm font-semibold ${valueToneClass(key, value)}`}
                      >
                        {value === undefined ? "—" : formatCellValue(key, value)}
                      </p>
                    </div>
                  );
                })}
              </div>

              {reasons.length > 0 && (
                <div className="mt-2">
                  {renderReasonCodes(reasons)}
                </div>
              )}
            </motion.article>
          );
        })}

        {hasMoreRows && (
          <div className="pt-2 pb-2">
            <button
              type="button"
              onClick={loadMoreRows}
              className="w-full h-11 rounded-xl border border-slate-700 bg-slate-900/70 text-slate-200 text-sm"
            >
              Показать еще ({Math.max(sortedData.length - visibleRowsCount, 0)})
            </button>
          </div>
        )}
      </div>

      <div className="relative hidden lg:block">
        <table className="w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-sm">
          <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0 z-10">
            <tr>
              {columns.map((key) => {
                const alignClass = isNumericColumn(key) ? "text-right" : "text-left";
                const isActive = sortConfig.key === key;
                const indicator = isActive
                  ? sortConfig.direction === "asc"
                    ? "▲"
                    : "▼"
                  : "↕";
                return (
                  <th
                    key={key}
                    className={`px-3 sm:px-4 py-2 text-xs sm:text-xs text-gray-700 dark:text-gray-300 cursor-pointer bg-gray-100 dark:bg-gray-700 ${alignClass}`}
                    onClick={() => handleSort(key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{tableN[key] || key.charAt(0).toUpperCase() + key.slice(1)}</span>
                      <span
                        className={`text-xs ${
                          isActive
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                      >
                        {indicator}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
        </table>

        <div
          id="dynamic-table-scroll"
          ref={scrollRef}
          onScroll={handleContainerScroll}
          style={{
            maxHeight: "calc(100vh - 4rem)",
            overflowY: "auto",
            overflowX: "auto",
          }}
        >
          <table className="w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-sm">
            <tbody>
              {renderedRows.map((row, rowIndex) => {
                const zebraClass =
                  rowIndex % 2 === 0
                    ? "bg-white/70 dark:bg-gray-900/40"
                    : "bg-gray-50/80 dark:bg-gray-900/70";
                const hoverClass = "hover:bg-blue-50/70 dark:hover:bg-blue-900/20";
                const animationDelay = rowIndex < 20 ? rowIndex * 0.012 : 0;
                const productName =
                  typeof row.productName === "string" ? row.productName : "—";

                return (
                  <Fragment key={`${productName}-${rowIndex}`}>
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.25,
                        delay: animationDelay,
                        ease: "easeInOut",
                      }}
                      className={`${zebraClass} ${hoverClass} transition-colors`}
                    >
                      <td
                        className="px-3 sm:px-4 py-2 text-xs sm:text-xs text-left text-gray-800 dark:text-gray-200"
                        colSpan={columns.length}
                        style={{
                          wordWrap: "break-word",
                          maxWidth: "150px",
                        }}
                      >
                        {productName.length > 34 ? (
                          <span className="break-all">{productName}</span>
                        ) : (
                          productName
                        )}
                      </td>
                    </motion.tr>
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.25,
                        delay: animationDelay,
                        ease: "easeInOut",
                      }}
                      className={`${zebraClass} ${hoverClass} border-b border-gray-200/40 dark:border-gray-700/40 transition-colors`}
                    >
                      <td className="px-3 sm:px-4 py-2" />
                      {columns.map((key) => {
                        if (key === "productName") return null;
                        const value = row[key];
                        const alignClass =
                          typeof value === "number" ? "text-right tabular-nums" : "text-left";
                        const emphasisClass = key === "sum" ? "font-semibold" : "font-medium";
                        const reasonCodesView =
                          key === "reasonCodes" && Array.isArray(value)
                            ? renderReasonCodes(value)
                            : null;
                        return (
                          <td
                            key={key}
                            className={`px-3 sm:px-4 py-2 text-xs sm:text-xs ${alignClass} ${emphasisClass} ${valueToneClass(
                              key,
                              value
                            )}`}
                          >
                            {reasonCodesView || (
                              <span>{value === undefined ? "—" : formatCellValue(key, value)}</span>
                            )}
                          </td>
                        );
                      })}
                    </motion.tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {hasMoreRows && (
            <div className="sticky bottom-0 z-20 bg-custom-gray dark:bg-gray-900 px-2 py-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={loadMoreRows}
                className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-300"
              >
                Показать еще ({Math.max(sortedData.length - visibleRowsCount, 0)})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
