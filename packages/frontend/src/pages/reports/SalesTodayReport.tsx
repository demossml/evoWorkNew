import { useEffect, useState, useRef } from "react";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import { ReportHeader, ReportShareButton } from "@shared/ui";

export default function SalesTodayReport() {
  const [salesData, setSalesData] = useState<Record<
    string,
    Record<string, number>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  useTelegramBackButton();

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSalesData = async () => {
      try {
        const response = await client.api.evotor["sales-today"].$get();

        const data = await response.json();
        setSalesData(data.salesData);
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить данные о продажах");
      }
    };

    fetchSalesData();
  }, []);

  if (error) {
    return <div className="text-destructive text-center mt-4">Ошибка: {error}</div>;
  }

  if (!salesData) {
    return <div className="text-center mt-4">Загрузка данных...</div>;
  }

  // Переменная для общего итога и разбивки по видам платежей
  const totalSales: Record<string, number> = {};
  let overallTotal = 0; // Общая сумма по всем магазинам

  Object.values(salesData).forEach((paymentTypes) => {
    Object.entries(paymentTypes).forEach(([paymentType, amount]) => {
      if (!totalSales[paymentType]) {
        totalSales[paymentType] = 0;
      }
      totalSales[paymentType] += amount;
      overallTotal += amount; // Суммируем для общего итога
    });
  });

  return (
    <div ref={reportRef} className="container mx-auto px-4 py-6">
      <ReportHeader title="Отчёт о продажах за сегодня" />
      <ul className="mt-4 space-y-4">
        {Object.entries(salesData).map(([shopName, paymentTypes]) => (
          <li key={shopName} className="bg-card border border-border shadow-sm rounded-lg p-4">
            <div className="flex items-center justify-between">
              <strong className="text-lg">{shopName}</strong>
              <span className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-semibold">
                Всего:{" "}
                {Object.values(paymentTypes).reduce(
                  (sum, amount) => sum + amount,
                  0
                )}{" "}
                ₽
              </span>
            </div>
            <ul className="mt-2">
              {Object.entries(paymentTypes).map(([paymentType, amount]) => (
                <li
                  key={paymentType}
                  className="flex justify-between text-muted-foreground mt-1"
                >
                  <span>{paymentType}</span>
                  <span className="font-bold">{amount} ₽</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {/* Общий итог по всем магазинам */}
      <div className="mt-6">
        <h3 className="text-xl font-bold text-center">
          Общий итог по всем магазинам
        </h3>
        <ul className="bg-card border border-border shadow-sm rounded-lg p-4 mt-4 space-y-2">
          {Object.entries(totalSales).map(([paymentType, totalAmount]) => (
            <li
              key={paymentType}
              className="flex justify-between text-muted-foreground mt-1"
            >
              <span>{paymentType}</span>
              <span className="font-bold">
                {(totalAmount as number).toFixed(2)} ₽
              </span>{" "}
              {/* Приведение типа */}
            </li>
          ))}
          {/* Общая сумма всех продаж */}
          <li className="flex justify-between font-bold text-lg">
            <span>Итого</span>
            <span>{overallTotal.toFixed(2)} ₽</span> {/* Приведение типа */}
          </li>
        </ul>
      </div>

      <div className="text-left mt-6">
        <a
          href="/"
          className="bg-primary text-primary-foreground py-2 px-4 rounded hover:bg-primary/90 active:bg-primary/80 transition duration-300"
        >
          На главную
        </a>
      </div>
      <ReportShareButton targetRef={reportRef} filename="sales-today" />
    </div>
  );
}
