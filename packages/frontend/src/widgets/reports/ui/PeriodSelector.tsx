import { useState } from "react";
import { motion } from "framer-motion";

type PeriodSelectorProps = {
  onPeriodChange: (period: number | null) => void;
};

export const PeriodSelector = ({ onPeriodChange }: PeriodSelectorProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  const selectPeriod = (period: number) => {
    setSelectedPeriod(period);
    onPeriodChange(period);
  };

  return (
    <div className="flex flex-col w-full justify-between">
      <p className="text-gray-700 dark:text-gray-400 mb-2 text-center">
        Выберите количество периодов для расчета
      </p>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => i + 1).map((period) => (
          <motion.button
            key={period}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => selectPeriod(period)}
            className={`p-2 rounded-md border ${
              selectedPeriod === period
                ? "bg-blue-500 dark:bg-blue-400 dark:border-blue-400 text-white dark:text-gray-400"
                : "bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400"
            }`}
          >
            <span className="text-sm">{period}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};
