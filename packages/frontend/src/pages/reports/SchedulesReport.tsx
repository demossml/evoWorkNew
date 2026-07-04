import { useSchedules } from "../../hooks/useApi";
import { motion } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";

export default function SchedulesReport() {
  const { data, error, isLoading } = useSchedules();

  useTelegramBackButton();

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="app-page flex flex-col items-center justify-center bg-custom-gray p-4"
      >
        <div className="flex items-center mb-4">
          <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          <h1 className="ml-4 text-xl sm:text-2xl text-gray-800 font-bold" />
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="app-page flex flex-col items-center justify-center bg-custom-gray p-4"
      >
        <h1 className="mb-4 text-xl sm:text-2xl text-gray-800 font-bold">
          Ошибка: {error.message}
        </h1>
      </motion.div>
    );
  }

  if (!data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="app-page flex flex-col items-center justify-center bg-custom-gray p-4"
      >
        <h1 className="mb-4 text-xl sm:text-2xl text-gray-800 font-bold">
          Нет данных для отображения.
        </h1>
        <div className="text-left mt-6">
          <a
            href="/"
            className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 active:bg-blue-700 transition duration-300"
          >
            На главную
          </a>
        </div>
      </motion.div>
    );
  }

  const { dataReport } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="app-page w-full px-4 bg-custom-gray dark:text-gray-400 dark:bg-gray-900"
    >
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-300 mb-4">
        Отчёт о времени открытия
      </h2>
      <div className="space-y-4">
        {Object.entries(dataReport).map(([key, value], idx) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.07, ease: "easeInOut" }}
            className="p-4 bg-custom-gray dark:bg-gray-700 rounded-lg shadow-md"
          >
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              {key}:
            </p>
            <p className="text-base text-gray-800 dark:text-gray-200">
              {String(value)}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
