import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import { invalidateDashboardQueries } from "@shared/api";
import {
  DEFAULT_ACCESSORY_SHARE_TARGET_PCT,
  getAccessoryShareTargetPct,
  setAccessoryShareTargetPct,
} from "../../config/tempoSettings";

interface GroupOption {
  uuid: string;
  name: string;
}

const Settings = () => {
  const queryClient = useQueryClient();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [salary, setSalary] = useState("");
  const [bonus, setBonus] = useState("");
  const [accessoryGroups, setAccessoryGroups] = useState<GroupOption[]>([]);
  const [savedGroups, setSavedGroups] = useState<string[]>([]);
  const [savedSalary, setSavedSalary] = useState("");
  const [savedBonus, setSavedBonus] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingGroups, setIsSavingGroups] = useState(false);
  const [isSavingSalaryBonus, setIsSavingSalaryBonus] = useState(false);

  const [showGroups, setShowGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
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
        const loadedSalary = String(Number(data.salary ?? 0));
        const loadedBonus = String(Number(data.bonus ?? 0));
        setSelectedGroups(loadedGroups);
        setSavedGroups(loadedGroups);
        setSalary(loadedSalary);
        setBonus(loadedBonus);
        setSavedSalary(loadedSalary);
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

  const salaryBonusDirty = salary !== savedSalary || bonus !== savedBonus;

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
    const salaryNumber = Number(salary);
    const bonusNumber = Number(bonus);

    if (!Number.isFinite(salaryNumber) || salaryNumber < 0) {
      setError("Оклад должен быть неотрицательным числом");
      return;
    }
    if (!Number.isFinite(bonusNumber) || bonusNumber < 0) {
      setError("Премия должна быть неотрицательным числом");
      return;
    }

    setSalaryBonusMessage(null);
    setError(null);
    setIsSavingSalaryBonus(true);
    try {
      const response = await client.api.evotor.settings["salary-bonus"].$post({
        json: {
          salary: salaryNumber,
          bonus: bonusNumber,
        },
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);

      setSavedSalary(String(salaryNumber));
      setSavedBonus(String(bonusNumber));
      setSalaryBonusMessage("Оклад и премия сохранены");
      await invalidateDashboardQueries(queryClient);
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить оклад и премию");
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

  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <h2 className="text-2xl font-bold mb-4">Настройки</h2>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-2">
          Настройка темпа продаж: доля аксессуаров
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Целевой порог доли высокомаржинальных аксессуаров в общей массе продаж.
          По умолчанию: {DEFAULT_ACCESSORY_SHARE_TARGET_PCT}%.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full sm:w-64">
            <label
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
              className="border border-gray-300 p-2 rounded w-full dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
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

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-3">Оклад и премия</h3>
        <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          {salaryBonusDirty ? "Есть несохранённые изменения" : "Сохранено"}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="salary">
              Оклад
            </label>
            <input
              type="number"
              id="salary"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              className="border border-gray-300 p-2 rounded w-full dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="bonus">
              Премия за план
            </label>
            <input
              type="number"
              id="bonus"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              className="border border-gray-300 p-2 rounded w-full dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={saveSalaryBonus}
            disabled={isLoading || isSavingSalaryBonus || !salaryBonusDirty}
            className={`text-white py-2 px-4 rounded transition duration-300 ${
              isLoading || isSavingSalaryBonus || !salaryBonusDirty
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-700 active:bg-blue-800"
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
                ? "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
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

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-2">Группы аксессуаров</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Выбранные группы берутся из БД и доступны для редактирования.
        </p>
        <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
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
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              {selectedGroupNames.join(", ")}
            </div>
          )}
        </div>

        {showGroups && (
          <fieldset className="mt-4 max-h-80 overflow-auto rounded border border-gray-200 dark:border-gray-700 p-3">
            <legend className="text-sm font-semibold px-1">
              Доступные группы
            </legend>
            <input
              type="text"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Поиск группы..."
              className="mb-3 border border-gray-300 p-2 rounded w-full dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
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
                className="py-1 px-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
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
                className="py-1 px-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
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
                : "bg-blue-500 hover:bg-blue-700 active:bg-blue-800"
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
                ? "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
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
    </div>
  );
};

export default Settings;
