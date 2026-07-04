import { motion } from "framer-motion";
import type { StoreOpeningStep } from "../../../pages/opening/types";
import { useIsOpenStore } from "../../../hooks/useIsOpenStore";
import { useMemo, useState } from "react";
import { Check, Camera, DollarSign, AlertCircle } from "lucide-react";
import { clearProgress } from "../../../helpers/openingProgress";
import { trackEvent } from "../../../helpers/analytics";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateDashboardQueries } from "@shared/api";
import { openStore } from "@features/opening/api";

interface InitialStepProps {
  setCurrentStep: React.Dispatch<React.SetStateAction<StoreOpeningStep>>;
  userId: string;
  selectedShop: string | null;
  userName?: string;
}

interface OpenStoreDetails {
  exists: boolean;
  openTime?: string;
  hasPhotos?: boolean;
  photoCount?: number;
  hasCashCheck?: boolean;
  completionPercent?: number;
}

export default function InitialStep({
  setCurrentStep,
  userId,
  selectedShop,
  userName,
}: InitialStepProps) {
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Формируем текущую дату в dd-mm-yyyy
  const today = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  const { data, isLoading, isError, refetch } = useIsOpenStore(
    userId,
    today,
    selectedShop,
  );
  const details = data as OpenStoreDetails | undefined;

  const handleStart = async () => {
    try {
      setErrorMessage(null);
      setIsStarting(true);
      if (!selectedShop) {
        throw new Error("Сначала выберите магазин");
      }
      void trackEvent("open_store_started", {
        shopUuid: selectedShop,
        props: { date: today },
      });
      await openStore({
        timestamp: new Date().toISOString(),
        userId,
        shopUuid: selectedShop,
        date: today,
        userName,
      });
      void trackEvent("open_store_success", {
        shopUuid: selectedShop,
      });
      await Promise.all([
        invalidateDashboardQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: ["isOpenStore"] }),
      ]);

      setCurrentStep("photos");
    } catch (error) {
      void trackEvent("open_store_failed", {
        shopUuid: selectedShop || undefined,
        props: {
          reason: error instanceof Error ? error.message : "unknown_error",
        },
      });
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось открыть магазин. Повторите попытку."
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleContinuePhotos = () => {
    setCurrentStep("photos");
  };

  const handleCashCheck = () => {
    setCurrentStep("cash_check");
  };

  const getNextStep = () => {
    if (!details?.exists) return null;
    if (!details.hasPhotos || (details.photoCount || 0) < 7) {
      return {
        step: "photos" as const,
        label:
          (details.photoCount || 0) > 0
            ? `Продолжить с фото (${7 - (details.photoCount || 0)} осталось)`
            : "Продолжить с фото",
      };
    }
    if (!details.hasCashCheck) {
      return {
        step: "cash_check" as const,
        label: "Перейти к проверке кассы",
      };
    }
    return null;
  };

  const nextStep = getNextStep();

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Утреннее открытие магазина</h1>

      {!selectedShop && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Выберите магазин на первом шаге.
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-500">Загрузка данных…</div>
      ) : isError ? (
        <div className="space-y-2">
          <div className="text-sm text-red-600">
            Не удалось получить статус открытия магазина.
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            Повторить
          </button>
        </div>
      ) : details?.exists ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Статус открытия */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-700 dark:text-green-300">
                Магазин открыт
              </span>
            </div>
            {details.openTime && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Время открытия: {formatTime(details.openTime)}
              </p>
            )}
          </div>

          {/* Прогресс выполнения */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Прогресс выполнения</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {details.completionPercent || 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <motion.div
                className="bg-blue-600 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${details.completionPercent || 0}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Детали выполнения */}
          <div className="space-y-2">
            {/* Фотографии */}
            <div
              className={`flex items-center justify-between p-3 rounded-lg border ${
                details.hasPhotos
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <Camera
                  className={`w-4 h-4 ${
                    details.hasPhotos ? "text-green-600" : "text-amber-600"
                  }`}
                />
                <span className="text-sm">Фотографии</span>
              </div>
              <div className="flex items-center gap-2">
                {details.hasPhotos ? (
                  <>
                    <span className="text-xs text-green-700 dark:text-green-300">
                      {details.photoCount || 0} / 7
                    </span>
                    <Check className="w-4 h-4 text-green-600" />
                  </>
                ) : (
                  <>
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      Не загружены
                    </span>
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  </>
                )}
              </div>
            </div>

            {/* Проверка кассы */}
            <div
              className={`flex items-center justify-between p-3 rounded-lg border ${
                details.hasCashCheck
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign
                  className={`w-4 h-4 ${
                    details.hasCashCheck ? "text-green-600" : "text-amber-600"
                  }`}
                />
                <span className="text-sm">Проверка кассы</span>
              </div>
              {details.hasCashCheck ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600" />
              )}
            </div>
          </div>

          {/* Действия */}
          <div className="space-y-2">
            {nextStep && (
              <motion.button
                onClick={() => setCurrentStep(nextStep.step)}
                className="w-full py-3 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700"
                whileTap={{ scale: 0.97 }}
              >
                {nextStep.label}
              </motion.button>
            )}

            {!details.hasPhotos && (
              <motion.button
                onClick={handleContinuePhotos}
                className="w-full py-3 bg-gray-200 text-gray-800 rounded-xl shadow"
                whileTap={{ scale: 0.97 }}
              >
                📸 К шагу фото
              </motion.button>
            )}

            {details.hasPhotos && (details.photoCount || 0) < 7 && (
              <motion.button
                onClick={handleContinuePhotos}
                className="w-full py-3 bg-gray-200 text-gray-800 rounded-xl shadow"
                whileTap={{ scale: 0.97 }}
              >
                📸 Открыть фото ({7 - (details.photoCount || 0)} осталось)
              </motion.button>
            )}

            {!details.hasCashCheck && (
              <motion.button
                onClick={handleCashCheck}
                className="w-full py-3 bg-gray-200 text-gray-800 rounded-xl shadow"
                whileTap={{ scale: 0.97 }}
              >
                💰 К шагу кассы
              </motion.button>
            )}

            {details.completionPercent === 100 && (
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-center">
                <span className="text-green-700 dark:text-green-300 text-sm font-medium">
                  ✅ Все задачи выполнены!
                </span>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={clearProgress}
                    className="text-xs text-green-700 underline"
                  >
                    Сбросить прогресс на сегодня
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.button
          onClick={handleStart}
          disabled={isStarting}
          className="w-full py-3 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700"
          whileTap={{ scale: 0.97 }}
        >
          {isStarting ? "Открываю..." : "Открыть магазин"}
        </motion.button>
      )}
    </div>
  );
}
