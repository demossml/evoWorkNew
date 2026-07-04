import type React from "react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";

// Тип для элемента группы
interface GroupOption {
  uuid: string;
  name: string;
}

// Тип для компонента
interface GroupSelectorProps {
  groupOptions: GroupOption[];
  selectedGroups: string[];
  setSelectedGroups: React.Dispatch<React.SetStateAction<string[]>>;
  isLoadingGroups: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

// Тип для групп, где ключом является строка (первая буква группы), а значением — массив групп
interface GroupDictionary {
  [key: string]: GroupOption[];
}

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  groupOptions,
  selectedGroups,
  setSelectedGroups,
  isLoadingGroups,
  onOpenChange,
}) => {
  const [showGroups, setShowGroups] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tempSelectedGroups, setTempSelectedGroups] = useState<string[]>([]);

  // Уведомляем родительский компонент об изменении состояния модального окна
  useEffect(() => {
    onOpenChange?.(showGroups);
  }, [showGroups, onOpenChange]);

  useEffect(() => {
    setTempSelectedGroups(selectedGroups);
  }, [selectedGroups]);

  // Обработчик для переключения видимости групп
  const handleShowGroups = () => {
    setSearchTerm("");
    setTempSelectedGroups(selectedGroups);
    setShowGroups((prevState) => !prevState);
  };

  // Обработчик для добавления или удаления группы из выбранных
  const handleGroupToggle = (groupUuid: string) => {
    setTempSelectedGroups((prevSelectedGroups) =>
      prevSelectedGroups.includes(groupUuid)
        ? prevSelectedGroups.filter((uuid) => uuid !== groupUuid)
        : [...prevSelectedGroups, groupUuid]
    );
  };

  // Быстрые плитки на основном экране применяются сразу
  const handleQuickGroupToggle = (groupUuid: string) => {
    setSelectedGroups((prevSelectedGroups) =>
      prevSelectedGroups.includes(groupUuid)
        ? prevSelectedGroups.filter((uuid) => uuid !== groupUuid)
        : [...prevSelectedGroups, groupUuid]
    );
  };

  // Закрытие модального окна
  const handleCloseModal = () => {
    setTempSelectedGroups(selectedGroups);
    setSearchTerm("");
    setShowGroups(false);
  };

  const applyGroupsSelection = () => {
    setSelectedGroups(tempSelectedGroups);
    setShowGroups(false);
  };

  const filteredGroupOptions = groupOptions.filter((group) =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  // Группируем группы по первой букве
  const groupedByLetter = filteredGroupOptions.reduce<GroupDictionary>(
    (groups, group) => {
      const firstLetter = group.name.charAt(0).toUpperCase();
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(group);
      return groups;
    },
    {}
  );

  const modalContent =
    showGroups ? (
      <motion.div
        className="fixed inset-0 z-[70] h-[100dvh] bg-custom-gray dark:bg-gray-900 flex flex-col"
        style={{
          paddingTop: "calc(max(var(--tg-safe-top, 0px), 4px) + 56px)",
          paddingBottom: "max(var(--tg-safe-bottom, 0px), 4px)",
        }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Заголовок */}
        <div className="p-2 border-b bg-gray-50 dark:bg-gray-800 flex justify-between items-center shrink-0">
          <p className="font-semibold text-lg text-gray-900 dark:text-gray-100">
            Выберите группу
          </p>
          <button
            onClick={handleCloseModal}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="p-2 border-b bg-gray-50 dark:bg-gray-800 shrink-0">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск группы..."
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Список групп */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {isLoadingGroups ? (
            <div className="flex items-center justify-center w-full h-full">
              <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
            </div>
          ) : filteredGroupOptions.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Ничего не найдено.
            </div>
          ) : (
            Object.entries(groupedByLetter).map(([letter, groups]) => (
              <motion.div
                key={letter}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-4"
              >
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 bg-custom-gray dark:bg-gray-700 mb-2">
                  {letter}
                </h3>
                <div className="space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.uuid}
                      className="flex items-center mt-2 cursor-pointer"
                      onClick={() => handleGroupToggle(group.uuid)}
                    >
                      <div
                        className={`w-4 h-4 rounded-full ${
                          tempSelectedGroups.includes(group.uuid)
                            ? "border-4 border-blue-500 bg-white dark:bg-gray-900"
                            : "border-2 border-gray-300 dark:border-gray-600 bg-custom-gray dark:bg-gray-800"
                        }`}
                      />
                      <span className="text-lg ml-2 text-gray-900 dark:text-gray-100">
                        {group.name}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Кнопки внизу */}
        <div className="sticky bottom-0 left-0 right-0 z-10 bg-gray-50 dark:bg-gray-800 border-t p-2 shrink-0">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => {
                const allGroupIds = groupOptions.map((group) => group.uuid);
                if (tempSelectedGroups.length === groupOptions.length) {
                  setTempSelectedGroups([]);
                } else {
                  setTempSelectedGroups(allGroupIds);
                }
              }}
            >
              <div
                className={`w-4 h-4 rounded-full mr-2 ${
                  tempSelectedGroups.length === groupOptions.length
                    ? "border-4 border-blue-500 bg-white dark:bg-gray-900"
                    : "border-2 border-gray-300 dark:border-gray-600 bg-custom-gray dark:bg-gray-800"
                }`}
              />
              <span className="text-base text-gray-900 dark:text-gray-100">
                Выбрать все группы
              </span>
            </div>
            <motion.button
              onClick={applyGroupsSelection}
              className={`px-4 py-2 rounded-md text-white ${
                tempSelectedGroups.length > 0
                  ? "bg-blue-500 hover:bg-blue-600"
                  : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
              }`}
              disabled={tempSelectedGroups.length === 0}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              Применить
            </motion.button>
          </div>
          <motion.button
            onClick={handleCloseModal}
            className="w-full p-2 rounded-md text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            Отмена
          </motion.button>
        </div>
      </motion.div>
    ) : null;

  return (
    <div className="group-selector">
      {/* Заголовок с кнопкой для отображения/скрытия списка групп */}
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-gray-700 dark:text-gray-400 text-sm">Группа</span>
        <button
          onClick={handleShowGroups}
          className="text-blue-500 dark:text-blue-400 text-sm"
        >
          {showGroups ? "Скрыть" : "Все →"}
        </button>
      </div>
      <div className="mb-3 text-xs text-gray-600 dark:text-gray-300">
        Выбрано:{" "}
        <span className="font-semibold text-gray-800 dark:text-gray-100">
          {selectedGroups.length}
        </span>
      </div>

      {/* Плитки групп (только для первых 7) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {isLoadingGroups ? (
          <div className="flex items-center justify-center w-full h-16">
            <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          </div>
        ) : (
          groupOptions.slice(0, 7).map((group, idx) => (
            <motion.button
              key={group.uuid}
              className={`
                flex 
                items-center 
                justify-center 
                px-3 
                py-2 
                rounded-md 
                text-cent
                dark:text-gray-400
                border-2 
                ${
                  selectedGroups.includes(group.uuid)
                    ? "border-blue-500 dark:border-blue-400"
                    : "border-gray-300 dark:border-gray-700"
                } 
                transition-colors 
                duration-300 
                ease-in-out
                min-w-max
                h-7
                whitespace-nowrap
              `}
              onClick={() => handleQuickGroupToggle(group.uuid)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              <span>{group.name}</span>
            </motion.button>
          ))
        )}
      </div>
      {/* Список групп (portal в body, всегда поверх экрана) */}
      {typeof document !== "undefined" &&
        showGroups &&
        createPortal(modalContent, document.body)}
    </div>
  );
};
