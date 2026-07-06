import { useEffect, useState } from "react";
import { client } from "../../helpers/api";
import { PlanForTodayResponseSchema } from "@/shared/api/contracts/planMetrics";

export default function PlanSalesReport() {
  const [salesData, setSalesData] = useState<Record<
    string,
    { datePlan: number; dataSales: number } | null
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Функция для получения данных о продажах за сегодня
    const fetchSalesData = async () => {
      try {
        const response = await client.api.evotor["plan-for-today"].$get();

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        const raw = await response.json();
        const parsed = PlanForTodayResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error("Некорректный формат данных плана");
        }
        setSalesData(parsed.data.salesData);
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить данные о продажах");
      }
    };

    fetchSalesData();
  }, []);

  if (error) {
    return <div className="text-red-500">Ошибка: {error}</div>;
  }

  if (!salesData) {
    return (
      <div className="app-page flex flex-col items-center justify-center bg-gray-100 p-4">
        <div className="flex items-center mb-4">
          {/* Loading spinner */}
          <div className="w-24 h-24 border-8 border-t-transparent border-primary border-solid rounded-full animate-spin" />
          <h1 className="ml-4 text-xl sm:text-2xl text-gray-800 font-bold" />
        </div>
      </div>
    );
  }

  // Генерация таблиц с сравнением план/факт продаж для каждого магазина
  const individualTables = Object.entries(salesData).map(([shopName, data]) => {
    if (data === null) {
      return (
        <li key={shopName} className="bg-white shadow-md rounded-lg p-4">
          <strong className="text-lg">{shopName}</strong>
          <p className="text-gray-700">Нет данных для отображения.</p>
        </li>
      );
    }

    const planAmount = data.datePlan;
    const salesAmount = data.dataSales;
    const colorClass =
      salesAmount !== undefined &&
      planAmount !== undefined &&
      salesAmount >= planAmount
        ? "bg-green-200" // Зелёный для превышения плана
        : "bg-red-200"; // Красный для недостатка

    const formattedPlanAmount =
      planAmount !== undefined ? planAmount.toFixed(2) : "N/A";
    const formattedSalesAmount =
      salesAmount !== undefined ? salesAmount.toFixed(2) : "N/A";

    return (
      <li key={shopName} className="bg-white shadow-md rounded-lg p-5">
        <strong className="text-lg">{shopName}</strong>
        <ul className="mt-31space-y-2">
          <li className="flex justify-between text-gray-700">
            <span>План</span>
            <span className="font-bold">{formattedPlanAmount} ₽</span>
          </li>
          <li className={`flex justify-between font-bold ${colorClass}`}>
            <span>Фактические продажи</span>
            <span>{formattedSalesAmount} ₽</span>
          </li>
        </ul>
      </li>
    );
  });

  return (
    <div className="container mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold text-center mt-4">
        Сравнение план/факт продаж
      </h2>
      <ul className="mt-4 space-y-4">{individualTables}</ul>

      <div className="text-left mt-6">
        <a
          href="/"
          className="bg-primary text-primary-foreground py-2 px-4 rounded hover:bg-primary/90 active:bg-primary/80 transition duration-300"
        >
          На главную
        </a>
      </div>
    </div>
  );
}
