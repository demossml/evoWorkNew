import { motion } from "framer-motion";
import { Package, TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "../../../utils/formatCurrency";
import type { ProductData } from "../type";

export type TopProductMetricMode = "revenue" | "quantity" | "margin";
export type TopProductRefundFilter = "all" | "noRefunds" | "highRefund";

interface TopProductCardProps {
  topProducts: ProductData[];
  previousTopProducts?: ProductData[];
  metricMode: TopProductMetricMode;
  refundFilter: TopProductRefundFilter;
  onClick?: () => void;
}

const HIGH_REFUND_THRESHOLD = 8;

const metricValue = (p: ProductData, mode: TopProductMetricMode) => {
  if (mode === "quantity") return p.netQuantity;
  if (mode === "margin") return p.marginPct;
  return p.netRevenue;
};

const metricFormatted = (p: ProductData, mode: TopProductMetricMode) => {
  if (mode === "quantity") return `${Math.round(p.netQuantity)} шт`;
  if (mode === "margin") return `${p.marginPct.toFixed(1)}%`;
  return `${formatCurrency(p.netRevenue)} ₽`;
};

const matchesRefundFilter = (
  p: ProductData,
  filter: TopProductRefundFilter
) => {
  if (filter === "noRefunds") return p.refundRevenue <= 0.0001;
  if (filter === "highRefund") return p.refundRate >= HIGH_REFUND_THRESHOLD;
  return true;
};

export function TopProductCard({
  topProducts,
  previousTopProducts = [],
  metricMode,
  refundFilter,
  onClick,
}: TopProductCardProps) {
  const filtered = topProducts
    .filter((p) => matchesRefundFilter(p, refundFilter))
    .sort((a, b) => metricValue(b, metricMode) - metricValue(a, metricMode));
  const product = filtered[0] || topProducts[0];
  if (!product) return null;

  const previousMap = new Map(
    previousTopProducts.map((item) => [item.productName, item])
  );
  const prev = previousMap.get(product.productName);
  const currentValue = metricValue(product, metricMode);
  const prevValue = prev ? metricValue(prev, metricMode) : 0;
  const trendPct =
    prevValue > 0 ? ((currentValue - prevValue) / prevValue) * 100 : 0;
  const trendUp = trendPct >= 0;

  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 dark:from-pink-600 dark:to-pink-700 text-white p-3 shadow-lg relative overflow-hidden min-h-[120px]"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium opacity-90">Топ продукт</span>
        <Package className="w-5 h-5 opacity-80" />
      </div>
      <div className="text-sm font-semibold truncate" title={product.productName}>
        {product.productName}
      </div>
      <div className="text-xl font-bold mt-1 flex items-center gap-2">
        <span>{metricFormatted(product, metricMode)}</span>
        <span
          className={`inline-flex items-center gap-0.5 text-xs ${
            trendUp ? "text-emerald-100" : "text-rose-100"
          }`}
        >
          {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {prev ? `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%` : "—"}
        </span>
      </div>
    </motion.div>
  );
}
