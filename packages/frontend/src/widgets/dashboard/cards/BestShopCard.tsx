import { motion } from "framer-motion";
import { Award } from "lucide-react";
import { formatCurrency } from "../../../utils/formatCurrency";

export type LeaderMode = "day" | "week";
export type LeaderReason = "чек" | "трафик" | "конверсия";

export interface ShopLeaderCardData {
  name: string;
  netRevenue: number;
  gapToSecond: number;
  reason: LeaderReason;
}

interface BestShopCardProps {
  dayLeader: ShopLeaderCardData | null;
  weekLeader: ShopLeaderCardData | null;
  mode: LeaderMode;
  onClick?: () => void;
}

export function BestShopCard({
  dayLeader,
  weekLeader,
  mode,
  onClick,
}: BestShopCardProps) {
  const current = mode === "week" ? weekLeader : dayLeader;

  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 text-white p-4 shadow-lg relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-90">Топ магазин</span>
        <Award className="w-5 h-5 opacity-80" />
      </div>

      {current ? (
        <>
          <div className="text-lg font-bold truncate">{current.name}</div>
          <div className="text-sm opacity-90 mt-1">
            {formatCurrency(current.netRevenue)} ₽
          </div>
        </>
      ) : (
        <div className="text-sm opacity-90">Нет данных</div>
      )}
    </motion.div>
  );
}
