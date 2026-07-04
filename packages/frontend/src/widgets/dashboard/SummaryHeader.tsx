// components/SummaryHeader.tsx
import { motion } from "framer-motion";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";

interface SummaryHeaderProps {
  lastUpdate: Date | null;
  dateMode: "today" | "yesterday" | "period";
  period?: DateRange;
}

export function SummaryHeader({
  lastUpdate,
  dateMode,
  period,
}: SummaryHeaderProps) {
  const getTitle = () => {
    if (dateMode === "today") {
      return "Сводка за сегодня";
    }
    if (dateMode === "yesterday") {
      return "Сводка за вчера";
    }
    if (dateMode === "period" && period?.from && period?.to) {
      return `Сводка за период ${format(period.from, "dd.MM.yyyy")} - ${format(period.to, "dd.MM.yyyy")}`;
    }
    return "Сводка";
  };

  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold">{getTitle()}</h1>
        {dateMode === "today" && (
          <p className="text-sm text-gray-500">
            {lastUpdate
              ? `Обновлено: ${lastUpdate.toLocaleTimeString("ru-RU")}`
              : "Загрузка данных…"}
          </p>
        )}
      </div>

      {dateMode === "today" && (
        <motion.div
          animate={{ opacity: 1 }}
          initial={{ opacity: 0.5 }}
          className="text-xs text-gray-400"
        >
          Автообновление
        </motion.div>
      )}
    </div>
  );
}
