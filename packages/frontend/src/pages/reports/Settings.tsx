import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import { invalidateDashboardQueries } from "@shared/api";
import { useGetShops } from "../../hooks/useApi";
import {
  DEFAULT_ACCESSORY_SHARE_TARGET_PCT,
  getAccessoryShareTargetPct,
  setAccessoryShareTargetPct,
} from "../../config/tempoSettings";

const DAYS_OF_WEEK = [
  { key: "mon", label: "Пн" },
  { key: "tue", label: "Вт" },
  { key: "wed", label: "Ср" },
  { key: "thu", label: "Чт" },
  { key: "fri", label: "Пт" },
  { key: "sat", label: "Сб" },
  { key: "sun", label: "Вс" },
] as const;

type DayKey = (typeof DAYS_OF_WEEK)[number]["key"];

interface DaySchedule {
  open: string;  // "HH:MM"
  close: string; // "HH:MM"
  working: boolean;
}

type ShopSchedule = Record<DayKey, DaySchedule>;

interface ShopSchedulesData {
  [shopUuid: string]: ShopSchedule;
}

const DEFAULT_DAY: DaySchedule = { open: "09:00", close: "21:00", working: true };
const DEFAULT_SCHEDULE: ShopSchedule = Object.fromEntries(
  DAYS_OF_WEEK.map((d) => [d.key, { ...DEFAULT_DAY }])
) as ShopSchedule;

interface GroupOption {
  uuid: string;
  name: string;
}

const Settings = () => {
  const queryClient = useQueryClient();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [bonus, setBonus] = useState("");
  const [accessoryGroups, setAccessoryGroups] = useState<GroupOption[]>([]);
  const [savedGroups, setSavedGroups] = useState<string[]>([]);
  const [savedBonus, setSavedBonus] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingGroups, setIsSavingGroups] = useState(false);
  const [isSavingSalaryBonus, setIsSavingSalaryBonus] = useState(false);

  const [showGroups, setShowGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");

  // --- Расписание магазинов ---
  const { data: shopsData } = useGetShops();
  const shops = shopsData?.shopsNameAndUuid ?? [];
  const [schedules, setSchedules] = useState<ShopSchedulesData>({});
  const [isSavingSchedules, setIsSavingSchedules] = useState(false);
  const [schedulesMessage, setSchedulesMessage] = useState<string | null>(null);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);

  // Инициализация расписания при загрузке списка магазинов
  useEffect(() => {
    if (shops.length > 0 && !schedulesLoaded) {
      setSchedules((prev) => {
        const next: ShopSchedulesData = {};
        for (const shop of shops) {
          next[shop.uuid] = prev[shop.uuid] ?? { ...DEFAULT_SCHEDULE };
        }
        return next;
      });
      setSchedulesLoaded(true);
    }
  }, [shops, schedulesLoaded]);
  const [error, setError] = useState<string | null>(null);
  const [groupsMessage, setGroupsMessage] = useState<string | null>(null);
  const [salaryBonusMessage, setSalaryBonusMessage] = useState<string | null>(null);

  const [accessoryShareTargetInput, setAccessoryShareTargetInput] = useState(
    String(DEFAULT_ACCESSORY_SHARE_TARGET_PCT)
  );
  const [tempoSettingsMessage, setTempoSettingsMessage] = useState<string | null>(
    null
  );

  useTelegramBackButton();

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await client.api.evotor["settings-config"].$get();
        if (!response.ok) throw new Error(`Ошибка: ${response.status}`);

        const data = await response.json();
        setAccessoryGroups(Array.isArray(data.groupOptions) ? data.groupOptions : []);
        const loadedGroups = Array.isArray(data.selectedGroupUuids)
          ? data.selectedGroupUuids
          : [];
        const loadedBonus = String(Number(data.bonus ?? 0));
        setSelectedGroups(loadedGroups);
        setSavedGroups(loadedGroups);
        setBonus(loadedBonus);
        setSavedBonus(loadedBonus);
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить настройки");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSettings();
  }, []);

  useEffect(() => {
    setAccessoryShareTargetInput(String(getAccessoryShareTargetPct()));
  }, []);

  const selectedGroupNames = useMemo(() => {
    const byUuid = new Map(accessoryGroups.map((group) => [group.uuid, group.name]));
    return selectedGroups.map((uuid) => byUuid.get(uuid)).filter(Boolean) as string[];
  }, [accessoryGroups, selectedGroups]);

  const filteredGroups = useMemo(() => {
    const search = groupSearch.trim().toLowerCase();
    if (!search) return accessoryGroups;
    return accessoryGroups.filter((group) =>
      group.name.toLowerCase().includes(search)
    );
  }, [accessoryGroups, groupSearch]);

  const groupsDirty = useMemo(() => {
    if (selectedGroups.length !== savedGroups.length) return true;
    const set = new Set(savedGroups);
    return selectedGroups.some((uuid) => !set.has(uuid));
  }, [selectedGroups, savedGroups]);

  const salaryBonusDirty = bonus !== savedBonus;

  const handleGroupChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.target;
    setSelectedGroups((prevGroups) =>
      checked ? [...prevGroups, value] : prevGroups.filter((group) => group !== value)
    );
  };

  const saveGroups = async () => {
    setGroupsMessage(null);
    setError(null);
    setIsSavingGroups(true);
    try {
      const response = await client.api.evotor.settings["accessory-groups"].$post({
        json: { groups: selectedGroups },
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      const result = await response.json();
      const names = Array.isArray(result.groupsName) ? result.groupsName : [];
      setSavedGroups([...selectedGroups]);
      setGroupsMessage(
        names.length > 0
          ? `Группы сохранены: ${names.join(", ")}`
          : "Группы аксессуаров сохранены"
      );
      await invalidateDashboardQueries(queryClient);
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить группы аксессуаров");
    } finally {
      setIsSavingGroups(false);
    }
  };

  const saveSalaryBonus = async () => {
    const bonusNumber = Number(bonus);

    if (!Number.isFinite(bonusNumber) || bonusNumber < 0) {
      setError("Бонус за план должен быть неотрицательным числом");
      return;
    }

    setSalaryBonusMessage(null);
    setError(null);
    setIsSavingSalaryBonus(true);
    try {
      const response = await client.api.evotor.settings["salary-bonus"].$post({
        json: {
          salary: 0,
          bonus: bonusNumber,
        },
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);

      setSavedBonus(String(bonusNumber));
      setSalaryBonusMessage("Бонус за план сохранён");
      await invalidateDashboardQueries(queryClient);
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить бонус");
    } finally {
      setIsSavingSalaryBonus(false);
    }
  };

  const saveTempoSettings = () => {
    const parsed = Number(accessoryShareTargetInput);
    if (!Number.isFinite(parsed)) {
      setTempoSettingsMessage("Введите число от 1 до 100");
      return;
    }
    const next = setAccessoryShareTargetPct(parsed);
    setAccessoryShareTargetInput(String(next));
    setTempoSettingsMessage(`Порог сохранен: ${next}%`);
  };

  // --- Расписание: обработчики ---

  const updateSchedule = (
    shopUuid: string,
    day: DayKey,
    patch: Partial<DaySchedule>
  ) => {
    setSchedules((prev) => ({
      ...prev,
      [shopUuid]: {
        ...(prev[shopUuid] ?? DEFAULT_SCHEDULE),
        [day]: {
          ...(prev[shopUuid]?.[day] ?? DEFAULT_DAY),
          ...patch,
        },
      },
    }));
  };

  const copyDayToAll = (sourceShopUuid: string, sourceDay: DayKey) => {
    const source = schedules[sourceShopUuid]?.[sourceDay] ?? DEFAULT_DAY;
    setSchedules((prev) => {
      const next: ShopSchedulesData = {};
      for (const shop of shops) {
        next[shop.uuid] = {
          ...(prev[shop.uuid] ?? DEFAULT_SCHEDULE),
          [sourceDay]: { ...source },
        };
      }
      return next;
    });
  };

  const applyFirstShopToAll = () => {
    if (shops.length === 0) return;
    const firstUuid = shops[0].uuid;
    const template = schedules[firstUuid] ?? DEFAULT_SCHEDULE;
    setSchedules((prev) => {
      const next: ShopSchedulesData = {};
      for (const shop of shops) {
        next[shop.uuid] = { ...template };
      }
      return next;
    });
  };

  const saveSchedules = async () => {
    setSchedulesMessage(null);
    setError(null);
    setIsSavingSchedules(true);
    try {
      const response = await client.api.evotor.settings["shop-schedules"].$post({
        json: { schedules },
      } as any);
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      setSchedulesMessage("Расписание сохранено");
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить расписание");
    } finally {
      setIsSavingSchedules(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <h2 className="text-2xl font-bold mb-4">Настройки</h2>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-border dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-2">
          Настройка темпа продаж: доля аксессуаров
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Целевой порог доли высокомаржинальных аксессуаров в общей массе продаж.
          По умолчанию: {DEFAULT_ACCESSORY_SHARE_TARGET_PCT}%.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full sm:w-64">
            <label
              className="block text-sm font-medium text-foreground mb-1"
              htmlFor="accessoryShareTarget"
            >
              Целевой порог, %
            </label>
            <input
              id="accessoryShareTarget"
              type="number"
              min={1}
              max={100}
              value={accessoryShareTargetInput}
              onChange={(e) => setAccessoryShareTargetInput(e.target.value)}
              className="border border-gray-300 p-2 rounded w-full dark:border-gray-600 dark:bg-background dark:text-foreground"
            />
          </div>
          <button
            type="button"
            onClick={saveTempoSettings}
            className="bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 transition duration-300"
          >
            Сохранить порог
          </button>
        </div>
        {tempoSettingsMessage && (
          <div className="mt-2 text-sm text-indigo-700 dark:text-indigo-300">
            {tempoSettingsMessage}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-border dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-3">Бонус за план</h3>
        <div className="mb-2 text-xs text-muted-foreground">
          {salaryBonusDirty ? "Есть несохранённые изменения" : "Сохранено"}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="bonus">
            Бонус за выполнение плана (₽/день)
          </label>
          <input
            type="number"
            id="bonus"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            className="border border-gray-300 p-2 rounded w-full dark:border-gray-600 dark:bg-background dark:text-foreground"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={saveSalaryBonus}
            disabled={isLoading || isSavingSalaryBonus || !salaryBonusDirty}
            className={`text-white py-2 px-4 rounded transition duration-300 ${
              isLoading || isSavingSalaryBonus || !salaryBonusDirty
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-blue-500 hover:bg-primary/90 active:bg-primary/80"
            }`}
          >
            {isSavingSalaryBonus ? "Сохранение..." : "Сохранить оклад и премию"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSalary(savedSalary);
              setBonus(savedBonus);
              setSalaryBonusMessage(null);
            }}
            disabled={isLoading || !salaryBonusDirty}
            className={`py-2 px-4 rounded transition duration-300 ${
              isLoading || !salaryBonusDirty
                ? "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-muted-foreground"
                : "bg-gray-100 text-gray-700 hover:bg-muted dark:text-foreground dark:hover:bg-gray-600"
            }`}
          >
            Сбросить
          </button>
        </div>
        {salaryBonusMessage && (
          <div className="mt-2 text-sm text-green-700 dark:text-green-300">
            {salaryBonusMessage}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-border dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-2">Группы аксессуаров</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Выбранные группы берутся из БД и доступны для редактирования.
        </p>
        <div className="mb-2 text-xs text-muted-foreground">
          {groupsDirty ? "Есть несохранённые изменения" : "Сохранено"}
        </div>

        <button
          type="button"
          onClick={() => setShowGroups((prev) => !prev)}
          className="mt-1 bg-gray-300 text-black py-2 px-4 rounded hover:bg-gray-400 transition duration-300"
          disabled={isLoading}
        >
          {showGroups ? "Скрыть группы" : "Выбор групп"}
        </button>

        <div className="mt-3 text-sm">
          Выбрано: <strong>{selectedGroups.length}</strong>
          {selectedGroupNames.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedGroupNames.join(", ")}
            </div>
          )}
        </div>

        {showGroups && (
          <fieldset className="mt-4 max-h-80 overflow-auto rounded border border-border p-3">
            <legend className="text-sm font-semibold px-1">
              Доступные группы
            </legend>
            <input
              type="text"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Поиск группы..."
              className="mb-3 border border-gray-300 p-2 rounded w-full dark:border-gray-600 dark:bg-background dark:text-foreground"
            />
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedGroups((prev) => {
                    const set = new Set(prev);
                    filteredGroups.forEach((g) => set.add(g.uuid));
                    return Array.from(set);
                  })
                }
                className="py-1 px-2 rounded bg-gray-100 text-gray-700 hover:bg-muted dark:text-foreground dark:hover:bg-gray-600"
              >
                Выбрать найденные
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedGroups((prev) =>
                    prev.filter(
                      (uuid) => !filteredGroups.some((group) => group.uuid === uuid)
                    )
                  )
                }
                className="py-1 px-2 rounded bg-gray-100 text-gray-700 hover:bg-muted dark:text-foreground dark:hover:bg-gray-600"
              >
                Снять найденные
              </button>
            </div>
            {filteredGroups.map((group) => (
              <div key={group.uuid} className="flex items-center py-1">
                <input
                  type="checkbox"
                  id={group.uuid}
                  value={group.uuid}
                  onChange={handleGroupChange}
                  checked={selectedGroups.includes(group.uuid)}
                  className="mr-2"
                />
                <label htmlFor={group.uuid}>{group.name}</label>
              </div>
            ))}
          </fieldset>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={saveGroups}
            disabled={isLoading || isSavingGroups || !groupsDirty}
            className={`text-white py-2 px-4 rounded transition duration-300 ${
              isLoading || isSavingGroups || !groupsDirty
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-blue-500 hover:bg-primary/90 active:bg-primary/80"
            }`}
          >
            {isSavingGroups ? "Сохранение..." : "Сохранить группы аксессуаров"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedGroups(savedGroups);
              setGroupsMessage(null);
            }}
            disabled={isLoading || !groupsDirty}
            className={`py-2 px-4 rounded transition duration-300 ${
              isLoading || !groupsDirty
                ? "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-muted-foreground"
                : "bg-gray-100 text-gray-700 hover:bg-muted dark:text-foreground dark:hover:bg-gray-600"
            }`}
          >
            Сбросить
          </button>
        </div>

        {groupsMessage && (
          <div className="mt-2 text-sm text-green-700 dark:text-green-300">
            {groupsMessage}
          </div>
        )}
      </div>

      {/* === Расписание магазинов === */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-border dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-2">Расписание магазинов</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Настройка времени открытия и закрытия по дням недели для каждого магазина.
        </p>

        {shops.length === 0 ? (
          <div className="text-sm text-muted-foreground">Загрузка магазинов...</div>
        ) : (
          <>
            {/* Кнопки управления */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={applyFirstShopToAll}
                className="py-1.5 px-3 rounded bg-gray-100 text-gray-700 text-sm hover:bg-muted dark:text-foreground dark:hover:bg-gray-600"
              >
                Применить ко всем магазинам (шаблон — первый)
              </button>
              <button
                type="button"
                onClick={saveSchedules}
                disabled={isSavingSchedules}
                className={`text-white py-1.5 px-4 rounded text-sm transition ${
                  isSavingSchedules
                    ? "bg-blue-300 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-primary/90"
                }`}
              >
                {isSavingSchedules ? "Сохранение..." : "Сохранить"}
              </button>
            </div>

            {/* Таблица */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">
                      Магазин
                    </th>
                    {DAYS_OF_WEEK.map((day) => (
                      <th
                        key={day.key}
                        className="border border-gray-300 dark:border-gray-600 p-2 text-center min-w-[120px]"
                      >
                        {day.label}
                        {shops.length > 0 && (
                          <button
                            type="button"
                            onClick={() => copyDayToAll(shops[0].uuid, day.key)}
                            className="ml-1 text-xs text-blue-500 hover:underline block"
                            title={`Скопировать ${day.label} на все магазины`}
                          >
                            📋 всем
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shops.map((shop) => {
                    const shopSched = schedules[shop.uuid] ?? DEFAULT_SCHEDULE;
                    return (
                      <tr key={shop.uuid} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="border border-gray-300 dark:border-gray-600 p-2 font-medium sticky left-0 bg-white dark:bg-gray-800 z-10">
                          {shop.name}
                        </td>
                        {DAYS_OF_WEEK.map((day) => {
                          const d = shopSched[day.key] ?? DEFAULT_DAY;
                          return (
                            <td
                              key={day.key}
                              className="border border-gray-300 dark:border-gray-600 p-2 align-top"
                            >
                              <div className="flex flex-col gap-1">
                                <label className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={d.working}
                                    onChange={(e) =>
                                      updateSchedule(shop.uuid, day.key, {
                                        working: e.target.checked,
                                      })
                                    }
                                    className="mr-0.5"
                                  />
                                  Рабочий
                                </label>
                                {d.working && (
                                  <>
                                    <input
                                      type="time"
                                      value={d.open}
                                      onChange={(e) =>
                                        updateSchedule(shop.uuid, day.key, {
                                          open: e.target.value,
                                        })
                                      }
                                      className="border border-gray-300 dark:border-gray-600 dark:bg-background dark:text-foreground rounded px-1 py-0.5 text-xs w-full"
                                      title="Открытие"
                                    />
                                    <input
                                      type="time"
                                      value={d.close}
                                      onChange={(e) =>
                                        updateSchedule(shop.uuid, day.key, {
                                          close: e.target.value,
                                        })
                                      }
                                      className="border border-gray-300 dark:border-gray-600 dark:bg-background dark:text-foreground rounded px-1 py-0.5 text-xs w-full"
                                      title="Закрытие"
                                    />
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {schedulesMessage && (
              <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                {schedulesMessage}
              </div>
            )}

            {/* Нижние кнопки */}
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={applyFirstShopToAll}
                className="py-1.5 px-3 rounded bg-gray-100 text-gray-700 text-sm hover:bg-muted dark:text-foreground dark:hover:bg-gray-600"
              >
                Применить ко всем магазинам
              </button>
              <button
                type="button"
                onClick={saveSchedules}
                disabled={isSavingSchedules}
                className={`text-white py-1.5 px-4 rounded text-sm transition ${
                  isSavingSchedules
                    ? "bg-blue-300 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-primary/90"
                }`}
              >
                {isSavingSchedules ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Settings;
