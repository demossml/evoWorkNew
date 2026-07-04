import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Store, Clock, User, AlertCircle } from "lucide-react";
import {
  fetchShopsOpeningStatus,
  type ShopOpeningStatus,
} from "@features/opening/api";

export function StoreOpeningStatusWidget() {
  const [shops, setShops] = useState<ShopOpeningStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const now = new Date();
        const day = String(now.getDate()).padStart(2, "0");
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const year = now.getFullYear();
        const date = `${day}-${month}-${year}`;
        const data = await fetchShopsOpeningStatus(date);
        setShops(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Не удалось загрузить статус"
        );
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const sortedShops = useMemo(
    () => [...shops].sort((a, b) => a.name.localeCompare(b.name)),
    [shops]
  );

  if (isLoading) {
    return (
      <div className="w-full mb-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full mb-4 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        {error}
      </div>
    );
  }

  if (sortedShops.length === 0) return null;

  const getStatus = (shop: ShopOpeningStatus) => {
    if (!shop.isOpenedToday) {
      return {
        label: "Не открыт",
        color:
          "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600",
        icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
      };
    }
    if (shop.isLate) {
      return {
        label: "Опоздание",
        color:
          "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
        icon: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
      };
    }
    return {
      label: "Открыт",
      color:
        "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
      icon: <Store className="w-3.5 h-3.5 text-green-500" />,
    };
  };

  return (
    <div className="w-full mb-4">
      <div className="grid grid-cols-3 gap-3">
        {sortedShops.map((shop, idx) => {
          const status = getStatus(shop);
          return (
            <motion.div
              key={shop.uuid}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`rounded-xl border p-2.5 ${status.color} flex flex-col gap-1`}
            >
              {/* Shop name + status icon */}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs truncate">
                  {shop.name}
                </span>
                {status.icon}
              </div>

              {/* Status text */}
              <div className="text-xs font-medium">
                {shop.isOpenedToday ? (
                  <>
                    <span
                      className={
                        shop.isLate
                          ? "text-red-600 dark:text-red-400"
                          : "text-green-600 dark:text-green-400"
                      }
                    >
                      {shop.openedTime || "—"}
                    </span>
                    {shop.openedByName && (
                      <span className="text-gray-500 dark:text-gray-400 ml-1 flex items-center gap-0.5">
                        <User className="w-2.5 h-2.5 inline" />
                        {shop.openedByName.split(" ")[0]}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">
                    ещё не открыт
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
