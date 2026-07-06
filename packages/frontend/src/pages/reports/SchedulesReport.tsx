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
          <div className="w-24 h-24 border-8 border-t-transparent border-primary border-solid rounded-full animate-spin" />
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
        <h1 className="mb-4 text-xl sm:text-2xl text-foreground font-bold">
          Нет данных для отображения.
        </h1>
        <div className="text-left mt-6">
          <a
            href="/"
            className="bg-primary text-primary-foreground py-2 px-4 rounded hover:bg-primary/90 active:bg-primary/80 transition duration-300"
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
      className="app-page w-full px-4 bg-background text-foreground"
    >
      <h2 className="text-xl font-bold text-foreground mb-4">
        Отчёт о времени открытия
      </h2>
      <div className="space-y-4">
        {Object.entries(dataReport).map(([key, value], idx) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.07, ease: "easeInOut" }}
            className="p-4 bg-card border border-border rounded-lg shadow-sm"
          >
            <p className="text-sm font-semibold text-muted-foreground">
              {key}:
            </p>
            <p className="text-base text-foreground">
              {String(value)}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
