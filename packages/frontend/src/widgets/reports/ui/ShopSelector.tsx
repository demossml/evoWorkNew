import type React from "react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";

type ShopSelectorProps = {
  isLoadingShops: boolean;
  fetchGroups: (shopUuid: string) => Promise<void>;
  shopOptions: Record<string, string>;
  selectedShop: string | null;
  setSelectedShop: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenChange?: (isOpen: boolean) => void;
};

export const ShopSelector: React.FC<ShopSelectorProps> = ({
  isLoadingShops,
  shopOptions,
  fetchGroups,
  selectedShop,
  setSelectedShop,
  onOpenChange,
}) => {
  const [showAllShops, setShowAllShops] = useState(false);
  const [tempSelectedShop, setTempSelectedShop] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Уведомляем родительский компонент об изменении состояния модального окна
  useEffect(() => {
    onOpenChange?.(showAllShops);
  }, [showAllShops, onOpenChange]);

  // Сортируем магазины по названию
  const sortedShops = Object.entries(shopOptions).sort(([, a], [, b]) =>
    a.localeCompare(b)
  );

  // Устанавливаем первый магазин по умолчанию
  useEffect(() => {
    if (!selectedShop && sortedShops.length > 0) {
      const firstShopUuid = sortedShops[0][0];
      setSelectedShop(firstShopUuid);
      fetchGroups(firstShopUuid);
    }
  }, [sortedShops, selectedShop, fetchGroups, setSelectedShop]);

  useEffect(() => {
    setTempSelectedShop(selectedShop);
  }, [selectedShop]);

  // Переключатель видимости модалки
  const handleShowAllShops = () => {
    setTempSelectedShop(selectedShop);
    setSearchTerm("");
    setShowAllShops((prev) => !prev);
  };

  // Выбор магазина во всплывающем окне
  const handleShopChange = (uuid: string) => setTempSelectedShop(uuid);

  const applyShopSelectionFromModal = () => {
    if (!tempSelectedShop) return;
    if (tempSelectedShop !== selectedShop) {
      setSelectedShop(tempSelectedShop);
      void fetchGroups(tempSelectedShop);
    }
    setShowAllShops(false);
  };

  // Подтверждение выбора магазина
  const handleConfirmShopSelection = () => {
    applyShopSelectionFromModal();
  };

  // Отмена выбора и закрытие модального окна
  const handleCancelSelection = () => {
    setTempSelectedShop(selectedShop);
    setSearchTerm("");
    setShowAllShops(false);
  };

  const filteredShops = sortedShops.filter(([, name]) =>
    name.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  // Группировка магазинов по первой букве
  const groupedShops = filteredShops.reduce<Record<string, [string, string][]>>(
    (groups, [uuid, name]) => {
      const firstLetter = name.charAt(0).toUpperCase();
      if (!groups[firstLetter]) groups[firstLetter] = [];
      groups[firstLetter].push([uuid, name]);
      return groups;
    },
    {}
  );

  const selectedShopName = selectedShop ? shopOptions[selectedShop] : null;
  const modalContent =
    showAllShops ? (
      <motion.div
        className="fixed inset-0 z-[70] h-[100dvh] bg-custom-gray dark:bg-gray-900 flex flex-col"
        style={{
          paddingTop: "calc(max(var(--tg-safe-top, 0px), 4px) + 56px)",
          paddingBottom: "max(var(--tg-safe-bottom, 0px), 4px)",
        }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Заголовок */}
        <div className="p-2 border-b bg-gray-50 dark:bg-gray-800 flex justify-between items-center shrink-0">
          <p className="font-semibold text-lg text-gray-900 dark:text-gray-100">
            Выберите магазин
          </p>
          <button
            onClick={handleCancelSelection}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="p-3 border-b bg-gray-50 dark:bg-gray-800 shrink-0">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск магазина..."
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Список магазинов */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {isLoadingShops ? (
            <div className="flex items-center justify-center w-full h-full">
              <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
            </div>
          ) : filteredShops.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Ничего не найдено.
            </div>
          ) : (
            Object.entries(groupedShops).map(([letter, shops]) => (
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
                  {shops.map(([uuid, name]) => (
                    <div
                      key={uuid}
                      className="flex items-center mt-2 cursor-pointer"
                      onClick={() => handleShopChange(uuid)}
                    >
                      <div
                        className={`w-4 h-4 rounded-full ${
                          tempSelectedShop === uuid
                            ? "border-4 border-blue-500 bg-white dark:bg-gray-900"
                            : "border-2 border-gray-300 dark:border-gray-600 bg-custom-gray dark:bg-gray-800"
                        }`}
                      />
                      <span className="text-lg ml-2 text-gray-900 dark:text-gray-100">
                        {name}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Кнопки подтверждения и отмены */}
        <div className="sticky bottom-0 left-0 right-0 z-10 bg-gray-50 dark:bg-gray-800 border-t p-2 flex gap-2 shrink-0">
          <motion.button
            onClick={handleCancelSelection}
            className="flex-1 p-2 rounded-md text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            Отмена
          </motion.button>
          <motion.button
            onClick={handleConfirmShopSelection}
            className={`flex-1 p-2 rounded-md text-white ${
              tempSelectedShop
                ? "bg-blue-500 hover:bg-blue-600"
                : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
            }`}
            disabled={!tempSelectedShop}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            Подтвердить
          </motion.button>
        </div>
      </motion.div>
    ) : null;

  return (
    <div className="shop-selector">
      {/* Заголовок */}
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-gray-700 dark:text-gray-400 text-sm">
          Магазин
        </span>
        <button
          onClick={handleShowAllShops}
          className="text-blue-500 dark:text-blue-400 text-sm"
        >
          {showAllShops ? "Скрыть" : "Все →"}
        </button>
      </div>
      {selectedShopName && (
        <div className="mb-3 text-xs text-gray-600 dark:text-gray-300">
          Выбран:{" "}
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            {selectedShopName}
          </span>
        </div>
      )}

      {/* Кнопки магазинов (первые 5) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {isLoadingShops ? (
          <div className="flex items-center justify-center w-full h-16">
            <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          </div>
        ) : (
          sortedShops.slice(0, 5).map(([uuid, name], idx) => (
            <motion.button
              key={uuid}
              className={`
                flex 
                items-center 
                justify-center 
                px-3 
                py-2 
                rounded-md 
                text-sm 
                font-medium
                border-2 
                ${
                  selectedShop === uuid
                    ? "border-blue-500 dark:border-blue-400"
                    : "border-gray-300 dark:border-gray-700"
                } 
                transition-colors 
                duration-300 
                ease-in-out
                min-w-max
                h-7
                whitespace-nowrap
                dark:text-gray-300
              `}
              onClick={() => {
                setSelectedShop(uuid);
                void fetchGroups(uuid);
                setTempSelectedShop(uuid);
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              {name}
            </motion.button>
          ))
        )}
      </div>

      {/* Модальное окно выбора магазина (portal в body) */}
      {typeof document !== "undefined" &&
        showAllShops &&
        createPortal(modalContent, document.body)}
    </div>
  );
};
