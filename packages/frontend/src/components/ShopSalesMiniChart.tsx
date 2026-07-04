import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

interface ChartPoint {
  time: string;
  value: number;
}

interface ShopChartData {
  shopName: string;
  data: ChartPoint[];
}

interface ShopSalesMiniChartProps {
  todayData: ShopChartData;
  sevenDaysAgoData: ShopChartData;
}

export default function ShopSalesMiniChart({
  todayData,
  sevenDaysAgoData,
}: ShopSalesMiniChartProps) {
  // Совмещаем данные по времени
  const mergedData = todayData.data.map((point, i) => ({
    time: new Date(point.time).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    today: point.value,
    sevenDaysAgo: sevenDaysAgoData.data[i]?.value || 0,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full h-52 sm:h-40 md:h-32 border-none bg-transparent"
      style={{ border: "none" }} // Убираем возможную рамку
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={mergedData}
          margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
        >
          <XAxis dataKey="time" hide />
          <YAxis hide />
          <Tooltip
            formatter={(value: number) => `${value.toLocaleString()} ₽`}
            labelFormatter={(label) => `Время: ${label}`}
            wrapperStyle={{
              backgroundColor: "transparent",
              padding: "6px",
              fontSize: "0.875rem",
              zIndex: 10,
              boxShadow: "none",
              border: "none", // Убираем рамку подсказки
            }}
            contentStyle={{
              backgroundColor: "transparent", // ⬅️ Прозрачный фон для содержимого
              border: "none",
              boxShadow: "none",
            }}
          />
          <Line
            type="monotone"
            dataKey="today"
            stroke="#8884d8"
            strokeWidth={2}
            dot={false}
            name="Сегодня"
          />
          <Line
            type="monotone"
            dataKey="sevenDaysAgo"
            stroke="#82ca9d"
            strokeDasharray="3 3"
            strokeWidth={2}
            dot={false}
            name="Неделю назад"
          />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
