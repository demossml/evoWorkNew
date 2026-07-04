import type React from "react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ScheduleTableView } from "@widgets/reports";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateScheduleQueries } from "@shared/api";

interface Shop {
  uuid: string;
  name: string;
}

interface Employee {
  uuid: string;
  name: string;
}

interface ScheduleEntry {
  date: string;
  employee: string;
}

interface ScheduleTableEntry {
  id: number;
  shopName: string;
  employeeName: string;
  date: string;
  shiftType: string;
}

const ScheduleTable: React.FC = () => {
  const queryClient = useQueryClient();
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [store, setStore] = useState("");
  const [stores, setStores] = useState<Shop[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<Record<string, ScheduleEntry[]>>(
    {}
  );
  const [scheduleTable, setScheduleTable] = useState<ScheduleTableEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false); // Добавлено состояние для отслеживания сохранения

  useTelegramBackButton();

  const navigate = useNavigate();

  // Получение количества дней в месяце
  const getDaysInMonth = (m: number, y: number) => {
    return new Date(y, m, 0).getDate();
  };

  // Загрузка магазинов
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const response = await client.api.stores.shops.$get();

        const data = await response.json();
        setStores(data.shopsNameAndUuid || []);
      } catch (error) {
        console.error("Ошибка при загрузке магазинов:", error);
      }
    };
    fetchStores();
  }, []);

  // Загрузка сотрудников
  useEffect(() => {
    const fetchEmployees = async () => {
      if (!store) return;

      try {
        const response = await client.api.employees.employee["and-store"][
          "name-uuid"
        ].$post({
          json: { shop: store },
        });
        const data = await response.json();
        if (
          data &&
          typeof data === "object" &&
          "employeeNameAndUuid" in data &&
          Array.isArray(data.employeeNameAndUuid)
        ) {
          setEmployees(data.employeeNameAndUuid);
        } else {
          setEmployees([]);
        }
      } catch (error) {
        console.error("Ошибка при загрузке сотрудников:", error);
      }
    };
    fetchEmployees();
  }, [store]);

  // Обновление расписания при изменении месяца/года
  useEffect(() => {
    if (!store) return;

    const daysInMonth = getDaysInMonth(month, year);
    const currentSchedule = schedules[store] || [];

    const newSchedule = Array.from({ length: daysInMonth }, (_, i) => ({
      date: new Date(year, month - 1, i + 1).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      employee: i < currentSchedule.length ? currentSchedule[i].employee : "",
    }));

    setSchedules((prev) => ({ ...prev, [store]: newSchedule }));
  }, [month, year, store]);

  const handleStoreChange = (newStore: string) => {
    const daysInMonth = getDaysInMonth(month, year);

    // Сохранение текущего магазина
    if (store) {
      setSchedules((prev) => ({
        ...prev,
        [store]: prev[store]?.slice(0, daysInMonth) || [],
      }));
    }

    // Инициализация нового магазина
    if (!schedules[newStore]) {
      setSchedules((prev) => ({
        ...prev,
        [newStore]: Array.from({ length: daysInMonth }, (_, i) => ({
          date: new Date(year, month - 1, i + 1).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }),
          employee: "",
        })),
      }));
    }

    setStore(newStore);
  };

  const handleChange = (dayIndex: number, value: string) => {
    const updatedSchedule = schedules[store].map((entry, index) =>
      index === dayIndex ? { ...entry, employee: value } : entry
    );

    setSchedules((prev) => ({ ...prev, [store]: updatedSchedule }));
  };

  const handleSave = async () => {
    setIsSaving(true); // Устанавливаем состояние "сохранение началось"

    try {
      const response = await client.api.schedules.table.$post({
        json: {
          month,
          year,
          schedules,
        },
      });

      if (!response.ok) throw new Error("Ошибка сохранения");

      const data = await response.json();
      setScheduleTable(data.scheduleTable || []);
      await invalidateScheduleQueries(queryClient);
    } catch (error) {
      console.error("Ошибка сохранения:", error);
      alert("Ошибка при сохранении табеля");
    }
  };

  if (scheduleTable.length > 0) {
    return <ScheduleTableView scheduleTable={scheduleTable} />;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Управление расписанием</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block mb-2">Месяц:</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="w-full p-2 border rounded"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleDateString("ru", { month: "long" })}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-2">Год:</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-full p-2 border rounded"
          >
            {Array.from({ length: 11 }, (_, i) => {
              const y = currentDate.getFullYear() - 5 + i;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block mb-2">Магазин:</label>
          <select
            value={store}
            onChange={(e) => handleStoreChange(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Выберите магазин</option>
            {stores.map((s) => (
              <option key={s.uuid} value={s.uuid}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {store && (
        <div className="space-y-4">
          {schedules[store]?.map((entry, index) => {
            const date = new Date(entry.date.split(".").reverse().join("-"));
            const isWeekend = [0, 6].includes(date.getDay());

            return (
              <div
                key={index}
                className="p-4 border rounded-lg bg-white shadow-sm"
              >
                <div
                  className={`mb-2 ${isWeekend ? "text-red-600 font-semibold" : ""}`}
                >
                  {entry.date}
                </div>
                <select
                  value={entry.employee}
                  onChange={(e) => handleChange(index, e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Выберите сотрудника</option>
                  {employees.map((emp) => (
                    <option
                      key={emp.uuid}
                      value={emp.uuid}
                      disabled={Object.values(schedules).some(
                        (s) => s[index]?.employee === emp.uuid
                      )}
                    >
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex gap-4">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 w-full"
          disabled={!store || isSaving} // Блокируем кнопку во время сохранения
        >
          {isSaving ? "Сохранение..." : "Сохранить"}{" "}
          {/* Изменяем текст кнопки */}
        </button>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 w-full"
        >
          Назад
        </button>
      </div>
    </div>
  );
};

export default ScheduleTable;
