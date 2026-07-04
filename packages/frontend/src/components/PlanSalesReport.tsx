import type React from "react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LoadingSpinner } from "./LoadingSpinner";
import { fetchPlanForToday } from "@shared/api";

interface SalesData {
  [shopName: string]: {
    datePlan: number;
    dataSales: number;
    dataQuantity: { [productName: string]: number } | null;
  } | null;
}

export const PlanSalesReport: React.FC = () => {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedShop, setExpandedShop] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoading(false);
      try {
        const data = await fetchPlanForToday();
        setSalesData(data.salesData || null);
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить данные о продажах");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSalesData();
  }, []);

  const toggleExpand = (shopName: string) => {
    setExpandedShop((prev) => (prev === shopName ? null : shopName));
  };

  if (error) {
    return (
      <div className="text-red-500 text-center font-semibold mt-4 dark:text-red-400">
        Ошибка: {error}
      </div>
    );
  }
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!salesData) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400">
        Загрузка данных...
      </div>
    );
  }

  const individualButtons = Object.entries(salesData).map(
    ([shopName, data]) => {
      const datePlan = data?.datePlan ?? 0;
      const dataSales = data?.dataSales ?? 0;
      const isPlanMet = dataSales >= datePlan;
      const colorClass = isPlanMet ? "border-green-400" : "border-red-400";
      const statusText = isPlanMet ? "План выполнен" : "План не выполнен";
      const statusClass = isPlanMet ? "text-green-500" : "text-red-500";

      // Преобразование объекта dataQuantity в массив, если данные есть
      const dataQuantityArray = data?.dataQuantity
        ? Object.entries(data.dataQuantity).map(([productNam, quantity]) => ({
            productNam,
            quantity,
          }))
        : [];

      return (
        <motion.li
          key={shopName}
          className={`bg-custom-gray dark:bg-gray-800 shadow-md mt-2 rounded-lg p-0 border-l-4 ${colorClass}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <button
            onClick={() => toggleExpand(shopName)}
            className="w-full text-left px-4"
          >
            <div className="flex justify-between items-center">
              <strong className="text-sm text-gray-800 dark:text-white">
                {shopName}
              </strong>
              <span className={`text-sm font-medium ${statusClass}`}>
                {statusText}
              </span>
            </div>
            <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
              <div>
                <p className="text-sm">План</p>
                <p className="font-bold text-sm ">{datePlan.toFixed(2)} ₽</p>
              </div>
              <div>
                <p className="text-sm">Продажи</p>
                <p className="font-bold text-sm">{dataSales.toFixed(2)} ₽</p>
              </div>
            </div>
          </button>

          <motion.div
            animate={{
              maxHeight: expandedShop === shopName ? 500 : 0,
              opacity: expandedShop === shopName ? 1 : 0,
            }}
            transition={{ duration: 0.1, ease: "easeInOut" }}
            className="overflow-hidden transition-all duration-300 ease-in-out"
          >
            {expandedShop === shopName && (
              <div className="mt-4 bg-custom-gray dark:bg-gray-700 p-3 rounded">
                <h4 className="text-sm font-bold mb-2 text-gray-800 dark:text-gray-100">
                  {dataQuantityArray.length > 0
                    ? "Проданные товары:"
                    : "Нет проданных товаров"}
                </h4>
                {dataQuantityArray.length > 0 ? (
                  <ul className="space-y-1">
                    {dataQuantityArray.map((item) => (
                      <li
                        key={`${shopName}-${item.productNam}-${item.quantity}`}
                        className="text-sm text-gray-700 dark:text-gray-300"
                      >
                        {item.productNam} — {item.quantity} шт.
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Данные отсутствуют
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </motion.li>
      );
    }
  );

  return (
    <div className="top-0 left-0 right-0 z-50 pt-4">
      <ul className="container mx-auto px-2 py-14 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {individualButtons}
      </ul>
    </div>
  );
};
