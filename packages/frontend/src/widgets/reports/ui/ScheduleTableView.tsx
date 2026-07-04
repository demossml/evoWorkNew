import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface ScheduleTableProps {
  scheduleTable: Array<{
    id: number;
    shopName: string;
    employeeName: string;
    date: string | number;
    shiftType: string;
  }>;
}

const ScheduleTableView: React.FC<ScheduleTableProps> = ({ scheduleTable }) => {
  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: "asc" | "desc" | null;
  }>({
    key: null,
    direction: null,
  });

  const sortedData = React.useMemo(() => {
    const sortableData = [...scheduleTable];
    if (sortConfig.key) {
      const key = sortConfig.key as keyof (typeof sortableData)[0];
      sortableData.sort((a, b) => {
        if (a[key] < b[key]) return sortConfig.direction === "asc" ? -1 : 1;
        if (a[key] > b[key]) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableData;
  }, [scheduleTable, sortConfig]);

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const navigate = useNavigate();
  const handleBack = () => {
    navigate("/");
  };

  const tableHeaders = {
    shopName: "Магазин",
    employeeName: "Сотрудник",
    date: "Дата",
  };

  const formatDate = (dateValue: string | number): string => {
    const dateString = String(dateValue);
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return `${dateString}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="overflow-x-auto w-full bg-custom-gray dark:bg-gray-900 rounded-t-lg"
    >
      <table className="min-w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-md">
        <thead className="bg-gray-100 dark:bg-gray-700">
          <tr>
            {Object.keys(tableHeaders).map((key) => (
              <th
                key={key}
                className="sticky top-0 z-10 px-4 py-3 text-left text-xs sm:text-sm text-gray-700 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600"
                onClick={() => handleSort(key)}
              >
                <div className="flex items-center">
                  {tableHeaders[key as keyof typeof tableHeaders]}
                  {sortConfig.key === key && (
                    <motion.span
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="ml-1 inline-block"
                    >
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </motion.span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, rowIndex) => (
            <motion.tr
              key={row.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: rowIndex * 0.03 }}
              className="border-t border-gray-200 dark:border-gray-700"
            >
              {Object.keys(tableHeaders).map((key) => {
                const value = row[key as keyof typeof row];

                const isWeekend =
                  key === "date" &&
                  (() => {
                    const dateString = String(value);
                    const date = new Date(dateString);
                    if (Number.isNaN(date.getTime())) return false;
                    const day = date.getDay();
                    return day === 0 || day === 6;
                  })();

                return (
                  <td
                    key={key}
                    className={`px-4 py-3 text-xs sm:text-sm ${
                      isWeekend
                        ? "text-red-500 dark:text-red-400 font-bold"
                        : "text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {key === "date" ? (
                      formatDate(value)
                    ) : (
                      <span className="break-all">{value}</span>
                    )}
                  </td>
                );
              })}
            </motion.tr>
          ))}
        </tbody>
      </table>
      <motion.button
        onClick={handleBack}
        className="btn bg-blue-700 text-white p-2 rounded w-full mt-4"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        Назад
      </motion.button>
    </motion.div>
  );
};

export default ScheduleTableView;
