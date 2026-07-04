import type React from "react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fetchEvotorShops } from "@shared/api";

type ShopSelectorProps = {
  userId: string;
  onShopSelect: (shopId: string) => void; // Пропс для передачи выбранного магазина
};

export const ShopSelectorNew: React.FC<ShopSelectorProps> = ({
  userId,
  onShopSelect,
}) => {
  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [isLoadingShops, setIsLoadingShops] = useState<boolean>(false);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);

  // Получение списка магазинов
  useEffect(() => {
    const fetchShops = async () => {
      setIsLoadingShops(true);

      try {
        const data = await fetchEvotorShops(userId);
        setShopOptions(data.shopOptions);

        // Устанавливаем первый магазин как выбранный по умолчанию
        if (Object.keys(data.shopOptions).length > 0) {
          const defaultShopUuid = Object.keys(data.shopOptions)[0];
          setSelectedShop(defaultShopUuid);
          onShopSelect(defaultShopUuid); // Передаём выбранный магазин в родительский компонент
        }
      } catch (err) {
        console.error("Ошибка при загрузке магазинов:", err);
      } finally {
        setIsLoadingShops(false);
      }
    };

    if (userId) {
      fetchShops();
    }
  }, [userId, onShopSelect]);

  // Обработка выбора магазина
  const handleShopSelect = (uuid: string) => {
    setSelectedShop(uuid);
    onShopSelect(uuid); // Передаём выбранный магазин в родительский компонент
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{
        duration: 0.4,
        ease: "easeOut",
        type: "spring",
        stiffness: 80,
      }}
    >
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-gray-700 dark:text-gray-400 text-sm">
          Магазин
        </span>
      </div>

      <div>
        {isLoadingShops ? (
          <div className="flex items-center justify-center w-full h-16">
            <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 dark:border-blue-400 border-solid rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex gap-2 mb-4">
            {Object.entries(shopOptions).map(([uuid, name]) => (
              <button
                key={uuid}
                className={`
                  flex 
                  justify-center 
                  items-center 
                  px-4 
                  py-2 
                  rounded-md 
                  text-center 
                  text-gray-700
                  dark:text-gray-400
                  border-2 
                  ${
                    selectedShop === uuid
                      ? "border-blue-500 dark:border-blue-400"
                      : "border-gray-300 dark:border-gray-700"
                  } 
                  transition-colors duration-200 ease-in-out
                  w-auto
                  h-7 
                  whitespace-nowrap
                `}
                onClick={() => handleShopSelect(uuid)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
