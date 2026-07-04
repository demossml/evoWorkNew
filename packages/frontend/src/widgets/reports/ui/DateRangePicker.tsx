import type React from "react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface DateRangePickerProps {
  onDateChange: (start: string, end: string) => void;
  onOpenChange?: (isOpen: boolean) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  onDateChange,
  onOpenChange,
}) => {
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [isStartDateFocused, setIsStartDateFocused] = useState(false);
  const [isEndDateFocused, setIsEndDateFocused] = useState(false);

  // Определяем, открыто ли модальное окно (браузерный date picker)
  const isDatePickerOpen = isStartDateFocused || isEndDateFocused;

  // Уведомляем родительский компонент об изменении состояния модального окна
  useEffect(() => {
    onOpenChange?.(isDatePickerOpen);
  }, [isDatePickerOpen, onOpenChange]);

  // Форматирование даты для отображения
  const formatDate = (date: string): string => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    return new Date(date).toLocaleDateString("ru-RU", options);
  };

  // Передаём даты наверх при изменении
  useEffect(() => {
    onDateChange(startDate, endDate);
  }, [startDate, endDate, onDateChange]);

  const handleStartDateFocus = () => {
    setIsStartDateFocused(true);
  };

  const handleStartDateBlur = () => {
    setIsStartDateFocused(false);
  };

  const handleEndDateFocus = () => {
    setIsEndDateFocused(true);
  };

  const handleEndDateBlur = () => {
    setIsEndDateFocused(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-lg mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-md p-4 sm:p-6 mb-6"
    >
      {/* Заголовок */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-4"
      >
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">
          {startDate && endDate
            ? `${formatDate(startDate)} → ${formatDate(endDate)}`
            : "Выберите период"}
        </h2>
      </motion.div>

      {/* Горизонтальный выбор дат */}
      <motion.div
        className="flex items-center justify-center gap-3 sm:gap-6 w-full"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Начало периода */}
        <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
          <input
            type="date"
            id="start-date"
            value={startDate}
            max={today}
            onChange={(e) => setStartDate(e.target.value)}
            onFocus={handleStartDateFocus}
            onBlur={handleStartDateBlur}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 
                       text-gray-800 dark:text-gray-200 p-2 sm:p-2.5 
                       focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
          />
        </motion.div>

        {/* Разделитель */}
        <span className="text-gray-500 dark:text-gray-400 font-medium">—</span>

        {/* Конец периода */}
        <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
          <input
            type="date"
            id="end-date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            onFocus={handleEndDateFocus}
            onBlur={handleEndDateBlur}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 
                       text-gray-800 dark:text-gray-200 p-2 sm:p-2.5 
                       focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
};
