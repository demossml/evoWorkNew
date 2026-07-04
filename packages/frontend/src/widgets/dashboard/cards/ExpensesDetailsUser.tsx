import type React from "react";
import { ShoppingCart } from "lucide-react";

interface ExpensesDetailsUserProps {
  cashOutcomeData: Record<string, Record<string, number>>;
  formatCurrency?: (amount: number) => string;
}

export const ExpensesDetailsUser: React.FC<ExpensesDetailsUserProps> = ({
  cashOutcomeData,
  formatCurrency = (amount) =>
    new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount),
}) => {
  // Берём первый магазин (для обычного пользователя)
  const shopName = Object.keys(cashOutcomeData)[0];
  const categories = cashOutcomeData[shopName] || {};
  const total = Object.values(categories).reduce((sum, val) => sum + val, 0);

  return (
    <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
      <div className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4" />
        Расходы по категориям:
      </div>
      <div className="space-y-2">
        {Object.entries(categories).length > 0 ? (
          <>
            {Object.entries(categories)
              .sort(([, a], [, b]) => b - a)
              .map(([category, amount]) => {
                const percentage = total > 0 ? (amount / total) * 100 : 0;
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
                {formatCurrency(total)} ₽
              </span>
            </div>
          </>
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Нет данных
          </span>
        )}
      </div>
    </div>
  );
};
