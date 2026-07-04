// components/ui/EmptyWorkDay.tsx
import { motion } from "framer-motion";

export function EmptyWorkDay() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md"
      >
        <h2 className="mb-2 text-lg font-semibold">Сегодня нет данных</h2>
        <p className="text-sm">
          Торговая точка сегодня не работает
          <br />
          или продажи ещё не начались
        </p>
      </motion.div>
    </div>
  );
}
