import React, { useEffect, useState } from "react";
import { Store, DollarSign, RotateCcw } from "lucide-react";
import {
  fetchRevenueRefundDocuments,
  type RefundDocument,
} from "@features/dashboard/api";

interface RevenueDetailsAdminProps {
  salesDataByShopName: Record<
    string,
    {
      sell: Record<string, number>;
      refund: Record<string, number>;
      totalSell: number;
      checksCount: number;
    }
  >;
  grandTotalSell: number;
  grandTotalRefund: number;
  netRevenue: number;
  averageCheck: number;
  totalChecks: number;
  since?: string;
  until?: string;
  formatCurrency?: (amount: number) => string;
}

export const RevenueDetailsAdmin: React.FC<RevenueDetailsAdminProps> = ({
  salesDataByShopName,
  grandTotalSell,
  grandTotalRefund,
  netRevenue,
  averageCheck,
  totalChecks,
  since,
  until,
  formatCurrency = (amount) =>
    new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount),
}) => {
  const [showRefundDocs, setShowRefundDocs] = useState(false);
  const [refundDocs, setRefundDocs] = useState<RefundDocument[]>([]);
  const [refundDocsLoading, setRefundDocsLoading] = useState(false);
  const [refundDocsError, setRefundDocsError] = useState<string | null>(null);

  // Вспомогательная функция для возвратов
  const getTotalRefund = (shopData: { refund: Record<string, number> }) =>
    Object.values(shopData.refund).reduce((sum, val) => sum + val, 0);

  useEffect(() => {
    if (!showRefundDocs || !since || !until) return;
    let cancelled = false;

    const loadRefundDocs = async () => {
      setRefundDocsLoading(true);
      setRefundDocsError(null);
      try {
        const json = await fetchRevenueRefundDocuments({ since, until, limit: "120" });
        if (!cancelled) {
          setRefundDocs(Array.isArray(json.documents) ? json.documents : []);
        }
      } catch (error) {
        if (!cancelled) {
          setRefundDocsError(
            error instanceof Error ? error.message : "Ошибка загрузки возвратов"
          );
        }
      } finally {
        if (!cancelled) setRefundDocsLoading(false);
      }
    };

    void loadRefundDocs();
    return () => {
      cancelled = true;
    };
  }, [showRefundDocs, since, until]);


  return (
    <div className="space-y-2">
      {Object.entries(salesDataByShopName)
        .sort(([, a], [, b]) => b.totalSell - a.totalSell)
        .map(([shopName, shopData]) => {
          const totalSell = shopData.totalSell;
          const totalRefund = getTotalRefund(shopData);
          const netShopSales = totalSell - totalRefund;
          const percentOfTotal =
            grandTotalSell > 0 ? (totalSell / grandTotalSell) * 100 : 0;
          const refundRate =
            totalSell > 0 ? (totalRefund / totalSell) * 100 : 0;

          return (
            <div
              key={shopName}
              className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {shopName}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  {percentOfTotal.toFixed(1)}%
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <div className="text-gray-500 dark:text-gray-400">
                    Продажи
                  </div>
                  <div className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(totalSell)} ₽
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400">
                    Возвраты
                  </div>
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
                  <div className="text-gray-500 dark:text-gray-400">
                    % возвратов
                  </div>
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

              {/* Разбивка по формам оплаты */}
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Продажи по формам оплаты */}
                  <div>
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Продажи по типу оплаты:
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

                  {/* Возвраты по формам оплаты */}
                  <div>
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" />
                      Возвраты по типу оплаты:
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

              {/* Progress bar */}
              <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${percentOfTotal}%` }}
                />
              </div>
            </div>
          );
        })}
      {/* Итоговая сводка */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-gray-500 dark:text-gray-400 mb-1">
              Общие продажи
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(grandTotalSell)} ₽
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 dark:text-gray-400 mb-1">
              Общие возвраты
            </div>
            <div className="text-lg font-bold text-red-600 dark:text-red-400">
              -{formatCurrency(grandTotalRefund)} ₽
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 dark:text-gray-400 mb-1">
              Чистая выручка
            </div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(netRevenue)} ₽
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 dark:text-gray-400 mb-1">
              Средний чек
            </div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {totalChecks > 0 ? formatCurrency(averageCheck) : "0"} ₽
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
            onClick={() => setShowRefundDocs((prev) => !prev)}
          >
            {showRefundDocs ? "Скрыть чеки возврата" : "Показать чеки возврата"}
          </button>
        </div>
      </div>

      {showRefundDocs && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <div className="mb-2 text-sm font-semibold text-red-800 dark:text-red-200">
            Возвраты: чеки с деталями
          </div>
          {refundDocsLoading && <div className="text-xs text-gray-600">Загрузка...</div>}
          {refundDocsError && <div className="text-xs text-red-600">{refundDocsError}</div>}
          {!refundDocsLoading && !refundDocsError && refundDocs.length === 0 && (
            <div className="text-xs text-gray-600">Возвратов за период нет.</div>
          )}
          {!refundDocsLoading && !refundDocsError && refundDocs.length > 0 && (
            <div className="space-y-2">
              {refundDocs.map((doc) => (
                <div key={`${doc.shopName}-${doc.documentNumber}-${doc.closeDate}`} className="rounded bg-white p-2 text-xs dark:bg-gray-800">
                  <div className="font-semibold">
                    {doc.shopName} • чек #{doc.documentNumber} • {new Date(doc.closeDate).toLocaleString("ru-RU")}
                  </div>
                  <div className="text-gray-500">Сотрудник: {doc.employeeName}</div>
                  <div className="text-red-700 dark:text-red-300">
                    Сумма возврата: {formatCurrency(doc.refundTotal)} ₽
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
