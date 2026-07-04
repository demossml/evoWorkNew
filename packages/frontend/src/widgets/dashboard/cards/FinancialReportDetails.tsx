import type React from "react";

interface ShopSalesData {
  totalSell: number;
  refund: Record<string, number>;
}

interface FinancialReportDetailsProps {
  salesDataByShopName: Record<string, ShopSalesData>;
  cashOutcomeData: Record<string, Record<string, number>>;
  cashBalanceByShop: Record<string, number>;
  grandTotalSell: number;
  grandTotalRefund: number;
  grandTotalCashOutcome: number;
  totalCashBalance: number;
}

const fmt = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

export const FinancialReportDetails: React.FC<FinancialReportDetailsProps> = ({
  salesDataByShopName,
  cashOutcomeData,
  cashBalanceByShop,
  grandTotalSell,
  grandTotalRefund,
  grandTotalCashOutcome,
  totalCashBalance,
}) => {
  const shopNames = Array.from(
    new Set([
      ...Object.keys(salesDataByShopName || {}),
      ...Object.keys(cashOutcomeData || {}),
      ...Object.keys(cashBalanceByShop || {}),
    ])
  ).sort((a, b) => a.localeCompare(b, "ru"));

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Сводный финансовый отчёт
      </h4>

      <div className="space-y-2">
        {shopNames.map((shopName) => {
          const sell = Number(salesDataByShopName?.[shopName]?.totalSell || 0);
          const refund = Object.values(
            salesDataByShopName?.[shopName]?.refund || {}
          ).reduce((sum, val) => sum + Number(val || 0), 0);
          const expenseCategories = Object.entries(
            cashOutcomeData?.[shopName] || {}
          )
            .map(([category, amount]) => [category, Number(amount || 0)] as const)
            .filter(([, amount]) => amount > 0)
            .sort(([, a], [, b]) => b - a);
          const expenses = expenseCategories.reduce(
            (sum, [, amount]) => sum + amount,
            0
          );
          const cash = Number(cashBalanceByShop?.[shopName] || 0);
          const net = sell - refund - expenses;

          return (
            <div
              key={shopName}
              className="rounded-lg bg-gray-50 dark:bg-gray-700 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {shopName}
                </span>
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                  Нетто: {fmt(net)} ₽
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-300">
                <div>Продажи: {fmt(sell)} ₽</div>
                <div>Возвраты: {fmt(refund)} ₽</div>
                <div>Расходы: {fmt(expenses)} ₽</div>
                <div>Наличные в кассе: {fmt(cash)} ₽</div>
              </div>
              {expenseCategories.length > 0 && (
                <div className="mt-2 rounded-md bg-white/60 dark:bg-gray-800/60 p-2">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                    Детализация расходов
                  </div>
                  <div className="space-y-1">
                    {expenseCategories.map(([category, amount]) => (
                      <div
                        key={`${shopName}-${category}`}
                        className="flex justify-between text-xs text-gray-700 dark:text-gray-300"
                      >
                        <span>{category}</span>
                        <span className="font-medium">{fmt(amount)} ₽</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-sm">
        <div className="flex justify-between">
          <span>Итого продажи:</span>
          <span className="font-semibold">{fmt(grandTotalSell)} ₽</span>
        </div>
        <div className="flex justify-between">
          <span>Итого возвраты:</span>
          <span className="font-semibold">{fmt(grandTotalRefund)} ₽</span>
        </div>
        <div className="flex justify-between">
          <span>Итого расходы:</span>
          <span className="font-semibold">{fmt(grandTotalCashOutcome)} ₽</span>
        </div>
        <div className="flex justify-between">
          <span>Наличные по всем магазинам:</span>
          <span className="font-semibold">{fmt(totalCashBalance)} ₽</span>
        </div>
      </div>
    </div>
  );
};
