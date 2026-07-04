import type React from "react";
import { Store, ShoppingCart } from "lucide-react";

interface ExpensesDetailsAdminProps {
  cashOutcomeData: Record<string, Record<string, number>>;
  grandTotalCashOutcome: number;
  formatCurrency?: (amount: number) => string;
}

export const ExpensesDetailsAdmin: React.FC<ExpensesDetailsAdminProps> = ({
  cashOutcomeData,
  grandTotalCashOutcome,
  formatCurrency = (amount) =>
    new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount),
}) => {
  return (
    <div>
      {/* Детализация расходов по магазинам */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Расходы по магазинам
        </h4>
        <div className="space-y-3">
          {Object.entries(cashOutcomeData)
            .sort(([, categoriesA], [, categoriesB]) => {
              const totalA = Object.values(categoriesA).reduce(
                (sum, val) => sum + val,
                0
              );
              const totalB = Object.values(categoriesB).reduce(
                (sum, val) => sum + val,
                0
              );
              return totalB - totalA;
            })
            .map(([shopName, categories]) => {
              const shopTotal = Object.values(categories).reduce(
                (sum, val) => sum + val,
                0
              );
              const shopPercentage =
                grandTotalCashOutcome > 0
                  ? (shopTotal / grandTotalCashOutcome) * 100
                  : 0;
              return (
                <div
                  key={shopName}
                  className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-orange-500" />
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {shopName}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-orange-600 dark:text-orange-400">
                        {formatCurrency(shopTotal)} ₽
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {shopPercentage.toFixed(1)}% от общих расходов
                      </div>
                    </div>
                  </div>
                  {/* Разбивка по категориям для магазина */}
                  <div className="space-y-2 pl-6">
                    {Object.entries(categories)
                      .sort(([, a], [, b]) => b - a)
                      .map(([category, amount]) => {
                        const categoryPercentage =
                          shopTotal > 0 ? (amount / shopTotal) * 100 : 0;
                        return (
                          <div
                            key={category}
                            className="flex justify-between items-center text-sm"
                          >
                            <span className="text-gray-600 dark:text-gray-400">
                              {category}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                {categoryPercentage.toFixed(0)}%
                              </span>
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {formatCurrency(amount)} ₽
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {/* Progress bar для магазина */}
                  <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 transition-all duration-300"
                      style={{ width: `${shopPercentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
        {/* Общий итог по всем магазинам */}
        <div className="mt-4 pt-4 border-t-2 border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-gray-900 dark:text-white">
              Итого по всем магазинам:
            </span>
            <span className="text-xl font-bold text-orange-600 dark:text-orange-400">
              {formatCurrency(grandTotalCashOutcome)} ₽
            </span>
          </div>
        </div>
      </div>
      {/* Разбивка расходов по категориям */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Расходы по категориям
        </h4>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
          <div className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Общие расходы по категориям:
          </div>
          <div className="space-y-2">
            {(() => {
              const categorySums: Record<string, number> = {};
              Object.values(cashOutcomeData).forEach((categories) => {
                Object.entries(categories).forEach(([category, amount]) => {
                  categorySums[category] =
                    (categorySums[category] || 0) + amount;
                });
              });
              const grandTotal = Object.values(categorySums).reduce(
                (sum, val) => sum + val,
                0
              );
              return Object.entries(categorySums).length > 0 ? (
                <>
                  {Object.entries(categorySums)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, amount]) => {
                      const percentage =
                        grandTotal > 0 ? (amount / grandTotal) * 100 : 0;
                      return (
                        <div key={category} className="space-y-1">
                          <div className="flex justify-between items-center text-sm py-1">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">
                              {category}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {percentage.toFixed(1)}%
                              </span>
                              <span className="font-bold text-orange-700 dark:text-orange-400">
                                {formatCurrency(amount)} ₽
                              </span>
                            </div>
                          </div>
                          {/* Progress bar для каждой категории */}
                          <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  <div className="flex justify-between items-center text-sm py-2 mt-3 pt-3 border-t border-orange-200 dark:border-orange-700">
                    <span className="text-gray-900 dark:text-white font-bold">
                      Итого:
                    </span>
                    <span className="font-bold text-lg text-orange-700 dark:text-orange-400">
                      {formatCurrency(grandTotal)} ₽
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Нет данных
                </span>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
