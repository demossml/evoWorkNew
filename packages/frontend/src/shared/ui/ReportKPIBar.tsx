import { motion } from "framer-motion";

export type KPIVariant = "blue" | "green" | "purple" | "amber" | "gray";

export interface KPIItem {
  label: string;
  value: string;
  variant?: KPIVariant;
}

interface ReportKPIBarProps {
  items: KPIItem[];
}

const variantClasses: Record<KPIVariant, string> = {
  blue: "bg-gradient-to-br from-blue-600 to-blue-700 text-white",
  green: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
  purple: "bg-gradient-to-br from-violet-500 to-indigo-600 text-white",
  amber: "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
  gray: "rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100",
};

export function ReportKPIBar({ items }: ReportKPIBarProps) {
  if (!items.length) return null;

  return (
    <div className={`grid gap-3 ${items.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
      {items.map((item, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: idx * 0.05 }}
          className={`rounded-xl p-4 ${variantClasses[item.variant || "gray"]}`}
        >
          <div className={`text-xs mb-1 ${item.variant && item.variant !== "gray" ? "opacity-85" : "text-gray-500 dark:text-gray-400"}`}>
            {item.label}
          </div>
          <div className="text-lg sm:text-xl font-bold">{item.value}</div>
        </motion.div>
      ))}
    </div>
  );
}
