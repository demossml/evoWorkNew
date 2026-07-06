import type React from "react";
import type { ProductData } from "../type";
import {
  BarChart3,
  Trophy,
  Medal,
  Package,
  Percent,
  Tags,
  ShoppingCart,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "../../../utils/formatCurrency";
import { Sparkline } from "@shared/ui";
import type {
  TopProductMetricMode,
  TopProductRefundFilter,
} from "./TopProductCard";

interface TopProductsDetailsProps {
  topProducts: ProductData[];
  metricMode: TopProductMetricMode;
  refundFilter: TopProductRefundFilter;
}

const HIGH_REFUND_THRESHOLD = 8;
const LOW_MARGIN_THRESHOLD = 20;
const SHARP_DROP_THRESHOLD = -30;

const metricValue = (p: ProductData, mode: TopProductMetricMode) => {
  if (mode === "quantity") return p.netQuantity;
  if (mode === "margin") return p.marginPct;
  return p.netRevenue;
};

const matchesRefundFilter = (
  p: ProductData,
  filter: TopProductRefundFilter
) => {
  if (filter === "noRefunds") return p.refundRevenue <= 0.0001;
  if (filter === "highRefund") return p.refundRate >= HIGH_REFUND_THRESHOLD;
  return true;
};

export const TopProductsDetails: React.FC<TopProductsDetailsProps> = ({
  topProducts,
  metricMode,
  refundFilter,
}) => {
  const filteredTop = topProducts
    .filter((p) => matchesRefundFilter(p, refundFilter))
    .sort((a, b) => metricValue(b, metricMode) - metricValue(a, metricMode));
  const top10 = filteredTop.slice(0, 10);
  const maxRevenue = top10.length > 0 ? metricValue(top10[0], metricMode) || 1 : 1;
  const totalRevenue = top10.reduce((s, p) => s + p.netRevenue, 0);
  const totalQuantity = top10.reduce((s, p) => s + p.netQuantity, 0);
  const avgPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;

  return (
    <div className="bg-card rounded-xl shadow-lg p-4 mt-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        🏆 Топ-10 продуктов
      </h3>
      <div className="flex items-center gap-2 mb-6 justify-center">
        <BarChart3 className="w-5 h-5 text-pink-500" />
        <h4 className="text-base font-bold text-foreground">
          Рейтинг товаров
        </h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {top10.map((product, index) => {
          const primary = metricValue(product, metricMode);
          const widthPercent = (primary / maxRevenue) * 100;
          const y = product.dailyNetRevenue7;
          const yesterday = y[6] || 0;
          const prevDay = y[5] || 0;
          const dayDropPct =
            prevDay > 0 ? ((yesterday - prevDay) / prevDay) * 100 : 0;
          const riskReasons: string[] = [];
          if (product.refundRate > HIGH_REFUND_THRESHOLD) riskReasons.push("возвраты");
          if (product.marginPct < LOW_MARGIN_THRESHOLD) riskReasons.push("низкая маржа");
          if (dayDropPct <= SHARP_DROP_THRESHOLD) riskReasons.push("резкое падение");
          const hasRisk = riskReasons.length > 0;

          let rankIcon: JSX.Element;
          if (index === 0)
            rankIcon = (
              <Trophy className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            );
          else if (index === 1)
            rankIcon = (
              <Medal className="w-5 h-5 text-gray-400 fill-gray-400" />
            );
          else if (index === 2)
            rankIcon = (
              <Medal className="w-5 h-5 text-orange-400 fill-orange-400" />
            );
          else
            rankIcon = (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {index + 1}
              </span>
            );
          return (
            <div key={product.productName} className="group">
              <div className="flex items-center justify-between text-sm mb-2">
                <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                  <div className="flex-shrink-0 w-6 flex justify-center">
                    {rankIcon}
                  </div>
                  <div className="truncate">
                    <div
                      className="font-semibold text-gray-900 dark:text-white truncate"
                      title={product.productName}
                    >
                      {product.productName}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-gray-900 dark:text-white">
                    {metricMode === "quantity"
                      ? `${Math.round(product.netQuantity)} шт`
                      : metricMode === "margin"
                        ? `${product.marginPct.toFixed(1)}%`
                        : `${formatCurrency(product.netRevenue)} ₽`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    выручка: {formatCurrency(product.netRevenue)} ₽
                  </div>
                </div>
              </div>
              <div className="mb-1 text-xs text-muted-foreground flex flex-wrap gap-2">
                <span>маржа: {product.marginPct.toFixed(1)}%</span>
                <span>шт: {Math.round(product.netQuantity)}</span>
                <span>доля: {totalRevenue > 0 ? ((product.netRevenue / totalRevenue) * 100).toFixed(1) : "0.0"}%</span>
                <span>возвраты: {product.refundRate.toFixed(1)}%</span>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Доля в топ-10:{" "}
                  <span className="font-medium text-foreground">
                    {totalRevenue > 0
                      ? ((product.netRevenue / totalRevenue) * 100).toFixed(1)
                      : "0.0"}
                    %
                  </span>
                </span>
                {hasRisk ? (
                  <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    Риск: {riskReasons.join(", ")}
                  </span>
                ) : (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Риск низкий
                  </span>
                )}
              </div>
              {index < 5 && (
                <div className="mb-2 rounded-md bg-muted/40 p-1.5 inline-flex">
                  <Sparkline values={product.dailyNetRevenue7 || []} />
                </div>
              )}
              <div className="relative h-2.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-pink-400 to-pink-600"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-border mt-6">
        <div className="bg-muted/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Package className="w-5 h-5 text-blue-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {topProducts.length}
          </div>
          <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Всего товаров
          </div>
        </div>
        <div className="bg-muted/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Percent className="w-5 h-5 text-purple-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {(
              (totalRevenue /
                (topProducts.reduce((s, p) => s + p.netRevenue, 0) || 1)) *
              100
            ).toFixed(0)}
            %
          </div>
          <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Доля топ-10
          </div>
        </div>
        <div className="bg-muted/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Tags className="w-5 h-5 text-green-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {formatCurrency(avgPrice)}
          </div>
          <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Ср. цена
          </div>
        </div>
        <div className="bg-muted/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <ShoppingCart className="w-5 h-5 text-orange-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {totalQuantity}
          </div>
          <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Продано шт
          </div>
        </div>
      </div>
    </div>
  );
};
