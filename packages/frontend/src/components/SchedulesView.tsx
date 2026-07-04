import type React from "react";
import { useState } from "react";
import { ShopSelectorNew } from "./ShopSelectorNew";
import { useMe } from "../hooks/useApi";
import { ScheduleTableView } from "@widgets/reports";
import { fetchScheduleTable } from "@features/reports/api";

// Определяем тип для данных расписания
interface ScheduleEntry {
  id: number;
  shopName: string;
  employeeName: string;
  date: string;
  shiftType: string;
}

const SchedulesView: React.FC = () => {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  const [scheduleData, setScheduleData] = useState<ScheduleEntry[] | null>(
    null
  ); // Типизация состояния
  const [shopId, setShopId] = useState<string | null>(null);

  const { data, isLoading } = useMe();
  const userId = data?.id?.toString() || "";

  const handleGetSchedule = async () => {
    if (!shopId) {
      alert("Выберите магазин!");
      return;
    }

    setIsLoadingTable(true);
    try {
      const data = (await fetchScheduleTable({
        month,
        year,
        shopId,
      })) as { scheduleTable?: ScheduleEntry[] };
      setScheduleData(data.scheduleTable || []); // Устанавливаем данные расписания
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Не удалось загрузить данные");
    } finally {
      setIsLoadingTable(false);
    }
  };

  const handleReset = () => {
    setScheduleData(null);
    setShopId(null);
  };

  if (isLoading) return <div>Загрузка данных пользователя...</div>;

  return (
    <div className="mt-4">
      {scheduleData ? (
        <div>
          <ScheduleTableView scheduleTable={scheduleData} />
          <button
            onClick={handleReset}
            className="btn bg-gray-500 text-white p-2 rounded w-full"
          >
            Новый запрос
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <label className="block mb-2 text-gray-700 dark:text-gray-400 text-sm">
              Месяц:
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border p-2 rounded w-full"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(0, i).toLocaleString("ru", { month: "long" })}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block mb-2 text-gray-700 dark:text-gray-400 text-sm">
              Год:
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border p-2 rounded w-full"
            >
              {Array.from({ length: 10 }, (_, i) => {
                const currentYear = new Date().getFullYear();
                return (
                  <option key={currentYear - 5 + i} value={currentYear - 5 + i}>
                    {currentYear - 5 + i}
                  </option>
                );
              })}
            </select>
          </div>

          <ShopSelectorNew userId={userId} onShopSelect={setShopId} />

          <button
            onClick={handleGetSchedule}
            disabled={isLoadingTable}
            className="mt-4 bg-blue-600 text-white p-2 rounded w-full hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isLoadingTable ? "Загрузка..." : "Показать табель"}
          </button>
        </>
      )}
    </div>
  );
};

export default SchedulesView;
