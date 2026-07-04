import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  fetchShopsOpeningStatus,
  type ShopOpeningStatus,
} from "@features/opening/api";

interface ShopStepProps {
  userId: string;
  selectedShop: string | null;
  setSelectedShop: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedShopName: React.Dispatch<React.SetStateAction<string | null>>;
  onContinue: () => void;
}

export default function ShopStep({
  userId,
  selectedShop,
  setSelectedShop,
  setSelectedShopName,
  onContinue,
}: ShopStepProps) {
  const [shops, setShops] = useState<ShopOpeningStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const now = new Date();
        const day = String(now.getDate()).padStart(2, "0");
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const year = now.getFullYear();
        const date = `${day}-${month}-${year}`;

        const nextShops = await fetchShopsOpeningStatus(date);

        setShops(nextShops);

        const allowedShops = nextShops.filter((shop) => shop.canSelect !== false);
        if (allowedShops.length > 0) {
          setSelectedShop((prev) => {
            const targetUuid = prev ?? allowedShops[0].uuid;
            const targetShop = nextShops.find((shop) => shop.uuid === targetUuid);
            if (targetShop?.canSelect === false) {
              setSelectedShopName(allowedShops[0].name);
              return allowedShops[0].uuid;
            }
            if (targetShop) {
              setSelectedShopName(targetShop.name);
            }
            return targetUuid;
          });
        } else {
          setSelectedShop(null);
          setSelectedShopName(null);
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить список магазинов",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void fetchShops();
  }, [setSelectedShop, setSelectedShopName, userId]);

  const sortedShops = useMemo(
    () => [...shops].sort((a, b) => a.name.localeCompare(b.name)),
    [shops],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Выберите магазин</h1>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-500">Загрузка магазинов…</div>
      ) : (
        <div className="space-y-2">
          {sortedShops.map((shop) => (
            <label
              key={shop.uuid}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                selectedShop === shop.uuid
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
              }`}
            >
              <input
                type="radio"
                name="shop"
                checked={selectedShop === shop.uuid}
                onChange={() => {
                  if (shop.canSelect === false) return;
                  setSelectedShop(shop.uuid);
                  setSelectedShopName(shop.name);
                }}
                disabled={shop.canSelect === false}
              />
              <div className="flex flex-col">
                <span>{shop.name}</span>
                {shop.canSelect === false && (
                  <span className="text-xs text-red-500">
                    {shop.blockedReason ||
                      `Уже открыл: ${
                        shop.openedByName || shop.openedByUserId || "другой пользователь"
                      }`}
                  </span>
                )}
                {shop.canSelect !== false && shop.isOpenedToday && (
                  <span className={`text-xs${shop.isLate ? " text-red-600 dark:text-red-400 font-semibold" : " text-green-600 dark:text-green-400"}`}>
                    Уже открыт{shop.openedByName ? `: ${shop.openedByName}` : ""}{shop.openedTime ? ` в ${shop.openedTime}` : ""}{shop.isLate ? " ⚠️ опоздание" : ""}
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      <motion.button
        type="button"
        onClick={onContinue}
        disabled={!selectedShop || isLoading}
        className={`w-full py-3 rounded-xl shadow font-medium ${
          selectedShop && !isLoading
            ? "bg-blue-600 text-white"
            : "bg-gray-300 text-gray-500 cursor-not-allowed"
        }`}
        whileTap={selectedShop && !isLoading ? { scale: 0.97 } : {}}
      >
        Далее
      </motion.button>
    </div>
  );
}
