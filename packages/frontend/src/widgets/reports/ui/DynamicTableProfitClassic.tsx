import React, { Fragment, useState, useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";

// Интерфейсы для данных отчёта и магазинов
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

interface DynamicTableProfitProps {
  report: ProfitReport | null;
  shops: ShopInfo[] | undefined;
}

// Словарь переводов для заголовков таблицы
const tableTranslations: { [key: string]: string } = {
  shopName: "Магазин",
  byCategory: "Расходы Evo (по категориям)",
  totalEvoExpenses: "Итого расходы Evo",
  expenses1C: "Расходы 1С",
  grossProfit: "Валовая прибыль",
  netProfit: "Чистая прибыль",
};

// Основной компонент таблицы прибыли
export const DynamicTableProfitClassic: React.FC<DynamicTableProfitProps> = ({
  report,
  shops,
}) => {
  // Состояние для сортировки таблицы
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Omit<TableRow, "byCategory"> | null;
    direction: "asc" | "desc" | null;
  }>({
    key: null,
    direction: null,
  });

  // Реф для прокрутки таблицы на десктопе
  const scrollRef = useRef<HTMLDivElement>(null);

  // Прогресс скролла и анимация полосы сверху
  const { scrollYProgress } = useScroll({
    container: scrollRef,
  });
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  // Подготовка данных отчета (чистая прибыль приходит из API)
  const tableData = React.useMemo(() => {
    if (!report || !shops) return [];

    const data: TableRow[] = Object.entries(report.report).map(
      ([uuid, shopData]) => {
        const shopName = shops.find((s) => s.uuid === uuid)?.name || uuid;
        return {
          shopName,
          byCategory: shopData.byCategory,
          totalEvoExpenses: shopData.totalEvoExpenses,
          expenses1C: shopData.expenses1C,
          grossProfit: shopData.grossProfit,
          netProfit: shopData.netProfit,
        };
      }
    );

    const totals: TableRow = {
      shopName: "Итого",
      byCategory: {},
      totalEvoExpenses: 0,
      expenses1C: 0,
      grossProfit: 0,
      netProfit: 0,
    };

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

  // Сортировка данных (итог всегда внизу)
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

  // Обработчик сортировки по клику на заголовок
  const handleSort = (key: keyof Omit<TableRow, "byCategory">) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // Если данные отсутствуют, возвращаем null
  if (!report || !shops) return null;

  const tableKeys: (keyof TableRow)[] = [
    "shopName",
    "totalEvoExpenses",
    "expenses1C",
    "grossProfit",
    "netProfit",
    "byCategory",
  ];

  return (
    // Основной контейнер таблицы, занимающий весь экран
    <div className="w-screen min-h-screen bg-gray-100 dark:bg-gray-900 px-2 sm:px-4 py-2">
      {/* Верхняя полоска прогресса скролла */}
      <motion.div
        style={{ scaleX, transformOrigin: "0%" }}
        className="h-1 bg-blue-500 mb-2 rounded-full"
      />

      {/* Таблица для экранов >= sm с горизонтальной и вертикальной прокруткой */}
      <div
        className="hidden sm:block relative"
        ref={scrollRef}
        style={{
          maxHeight: "calc(100vh - 4rem)",
          overflowY: "auto",
          overflowX: "auto",
        }}
      >
        <table className="w-full table-auto bg-gray-100 dark:bg-gray-900 rounded-lg shadow-md">
          <thead className="bg-gray-200 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              {tableKeys.map((key) => (
                <th
                  key={key}
                  className={`px-2 sm:px-4 py-1 sm:py-2 text-left text-xs sm:text-xs text-gray-700 dark:text-gray-300 ${
                    key !== "byCategory" ? "cursor-pointer" : ""
                  }`}
                  onClick={() => {
                    if (key !== "byCategory") {
                      handleSort(key);
                    }
                  }}
                >
                  {tableTranslations[key] || key}{" "}
                  {key !== "byCategory" && sortConfig.key === key
                    ? sortConfig.direction === "asc"
                      ? "↑"
                      : "↓"
                    : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => {
              const isTotalRow = row.shopName === "Итого";
              const animationDelay = idx < 12 ? idx * 0.03 : 0;
              return (
                <Fragment key={idx}>
                  <motion.tr
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.25,
                      delay: animationDelay,
                      ease: "easeInOut",
                    }}
                    className={`border-b border-gray-300 dark:border-gray-700 ${
                      isTotalRow ? "font-bold bg-gray-300 dark:bg-gray-700" : ""
                    }`}
                  >
                    <td className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-xs">
                      {row.shopName}
                    </td>
                    <td className="px-2 sm:px-4 py-1 sm:py-2 text-right font-semibold text-xs sm:text-xs whitespace-nowrap">
                      {row.totalEvoExpenses.toLocaleString()} ₽
                    </td>
                    <td className="px-2 sm:px-4 py-1 sm:py-2 text-right font-semibold text-xs sm:text-xs whitespace-nowrap">
                      {row.expenses1C.toLocaleString()} ₽
                    </td>
                    <td className="px-2 sm:px-4 py-1 sm:py-2 text-right font-semibold text-xs sm:text-xs whitespace-nowrap">
                      {row.grossProfit.toLocaleString()} ₽
                    </td>
                    <td className="px-2 sm:px-4 py-1 sm:py-2 text-right font-semibold text-xs sm:text-xs whitespace-nowrap">
                      {row.netProfit.toLocaleString()} ₽
                    </td>
                    <td className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-xs">
                      {Object.entries(row.byCategory).map(([cat, val]) => (
                        <div key={cat} className="text-xs sm:text-xs">
                          {cat}: {val.toLocaleString()} ₽
                        </div>
                      ))}
                    </td>
                  </motion.tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Карточки для мобильных экранов с внутренней прокруткой */}
      <div className="block sm:hidden space-y-1 px-2 py-2 max-h-[calc(100vh-4rem)] overflow-y-auto">
        {sortedData.map((row, idx) => {
          const isTotalRow = row.shopName === "Итого";
          const animationDelay = idx < 12 ? idx * 0.03 : 0;
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: animationDelay }}
              className={`p-3 rounded-lg shadow-md bg-white dark:bg-gray-800 ${
                isTotalRow ? "font-bold border-2 border-blue-500" : "border"
              }`}
            >
              <div className="mb-1 text-sm sm:text-base">{row.shopName}</div>
              <div className="text-xs sm:text-xs space-y-1">
                <div>
                  <strong>{tableTranslations.totalEvoExpenses}:</strong>{" "}
                  {row.totalEvoExpenses.toLocaleString()} ₽
                </div>
                <div>
                  <strong>{tableTranslations.expenses1C}:</strong>{" "}
                  {row.expenses1C.toLocaleString()} ₽
                </div>
                <div>
                  <strong>{tableTranslations.grossProfit}:</strong>{" "}
                  {row.grossProfit.toLocaleString()} ₽
                </div>
                <div>
                  <strong>{tableTranslations.netProfit}:</strong>{" "}
                  {row.netProfit.toLocaleString()} ₽
                </div>
                <div>
                  <strong>{tableTranslations.byCategory}:</strong>
                  <div
                    className="mt-1 grid grid-cols-2 gap-1 overflow-y-auto"
                    style={{ maxHeight: "200px" }}
                  >
                    {Object.entries(row.byCategory).map(([cat, val]) => (
                      <div key={cat} className="text-xs">
                        {cat}: {val.toLocaleString()} ₽
                      </div>
                    ))}
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
