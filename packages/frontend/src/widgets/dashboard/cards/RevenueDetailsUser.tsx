import type React from "react";
import { DollarSign, RotateCcw } from "lucide-react";

interface RevenueDetailsUserProps {
  salesDataByShopName: Record<
    string,
    {
      sell: Record<string, number>;
      refund: Record<string, number>;
      totalSell: number;
      checksCount: number;
    }
  >;
  formatCurrency?: (amount: number) => string;
}

export const RevenueDetailsUser: React.FC<RevenueDetailsUserProps> = ({
  salesDataByShopName,
  formatCurrency = (amount) =>
    new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount),
}) => {
  // Берём первый магазин (для обычного пользователя)
  const shopName = Object.keys(salesDataByShopName)[0];
  const shopData = salesDataByShopName[shopName] || {
    sell: {},
    refund: {},
    totalSell: 0,
    checksCount: 0,
  };
  const totalSell = shopData.totalSell;
  const totalRefund = Object.values(shopData.refund).reduce(
    (sum, val) => sum + val,
    0
  );
  const netShopSales = totalSell - totalRefund;
  const refundRate = totalSell > 0 ? (totalRefund / totalSell) * 100 : 0;
  const averageCheck =
    shopData.checksCount > 0 ? netShopSales / shopData.checksCount : 0;

  return (
    <div className="space-y-2">
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-gray-900 dark:text-white">
            {shopName}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-gray-500 dark:text-gray-400">Продажи</div>
            <div className="font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(totalSell)} ₽
            </div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400">Возвраты</div>
            <div className="font-semibold text-red-600 dark:text-red-400">
              {formatCurrency(totalRefund)} ₽
            </div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400">Чистая</div>
            <div className="font-semibold text-blue-600 dark:text-blue-400">
              {formatCurrency(netShopSales)} ₽
            </div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400">% возвратов</div>
            <div
              className={`font-semibold ${
                refundRate > 10
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {refundRate.toFixed(1)}%
            </div>
          </div>
        </div>
        {/* Продажи по формам оплаты */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Продажи по типу оплаты:
              </div>
              <div className="space-y-1">
                {Object.entries(shopData.sell).length > 0 ? (
                  Object.entries(shopData.sell)
                    .sort(([, a], [, b]) => b - a)
                    .map(([paymentType, amount]) => (
                      <div
                        key={paymentType}
                        className="flex justify-between items-center text-xs"
                      >
                        <span className="text-gray-600 dark:text-gray-400">
                          {paymentType}
                        </span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(amount)} ₽
                        </span>
                      </div>
                    ))
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Нет данных
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Возвраты по типу оплаты:
              </div>
              <div className="space-y-1">
                {Object.entries(shopData.refund).length > 0 ? (
                  Object.entries(shopData.refund)
                    .sort(([, a], [, b]) => b - a)
                    .map(([paymentType, amount]) => (
                      <div
                        key={paymentType}
                        className="flex justify-between items-center text-xs"
                      >
                        <span className="text-gray-600 dark:text-gray-400">
                          {paymentType}
                        </span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {formatCurrency(amount)} ₽
                        </span>
                      </div>
                    ))
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Нет данных
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Итоговая сводка */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-gray-500 dark:text-gray-400 mb-1">
                Продажи
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {formatCurrency(totalSell)} ₽
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 dark:text-gray-400 mb-1">
                Возвраты
              </div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(totalRefund)} ₽
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 dark:text-gray-400 mb-1">
                Чистая выручка
              </div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(netShopSales)} ₽
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 dark:text-gray-400 mb-1">
                Средний чек
              </div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatCurrency(averageCheck)} ₽
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
