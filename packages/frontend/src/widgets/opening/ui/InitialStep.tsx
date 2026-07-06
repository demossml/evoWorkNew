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
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning">
          Выберите магазин на первом шаге.
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка данных…</div>
      ) : isError ? (
        <div className="space-y-2">
          <div className="text-sm text-destructive">
            Не удалось получить статус открытия магазина.
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
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
          <div className="bg-success/10 border border-success/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-5 h-5 text-success" />
              <span className="font-medium text-success">
                Магазин открыт
              </span>
            </div>
            {details.openTime && (
              <p className="text-sm text-muted-foreground">
                Время открытия: {formatTime(details.openTime)}
              </p>
            )}
          </div>

          {/* Прогресс выполнения */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Прогресс выполнения</span>
              <span className="text-sm text-muted-foreground">
                {details.completionPercent || 0}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <motion.div
                className="bg-primary h-2 rounded-full"
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
                  ? "bg-success/10 border-success/30"
                  : "bg-warning/10 border-warning/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Camera
                  className={`w-4 h-4 ${
                    details.hasPhotos ? "text-success" : "text-warning"
                  }`}
                />
                <span className="text-sm">Фотографии</span>
              </div>
              <div className="flex items-center gap-2">
                {details.hasPhotos ? (
                  <>
                    <span className="text-xs text-success">
                      {details.photoCount || 0} / 7
                    </span>
                    <Check className="w-4 h-4 text-success" />
                  </>
                ) : (
                  <>
                    <span className="text-xs text-warning">
                      Не загружены
                    </span>
                    <AlertCircle className="w-4 h-4 text-warning" />
                  </>
                )}
              </div>
            </div>

            {/* Проверка кассы */}
            <div
              className={`flex items-center justify-between p-3 rounded-lg border ${
                details.hasCashCheck
                  ? "bg-success/10 border-success/30"
                  : "bg-warning/10 border-warning/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign
                  className={`w-4 h-4 ${
                    details.hasCashCheck ? "text-success" : "text-warning"
                  }`}
                />
                <span className="text-sm">Проверка кассы</span>
              </div>
              {details.hasCashCheck ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-warning" />
              )}
            </div>
          </div>

          {/* Действия */}
          <div className="space-y-2">
            {nextStep && (
              <motion.button
                onClick={() => setCurrentStep(nextStep.step)}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl shadow hover:bg-primary/90"
                whileTap={{ scale: 0.97 }}
              >
                {nextStep.label}
              </motion.button>
            )}

            {!details.hasPhotos && (
              <motion.button
                onClick={handleContinuePhotos}
                className="w-full py-3 bg-secondary text-secondary-foreground rounded-xl shadow"
                whileTap={{ scale: 0.97 }}
              >
                📸 К шагу фото
              </motion.button>
            )}

            {details.hasPhotos && (details.photoCount || 0) < 7 && (
              <motion.button
                onClick={handleContinuePhotos}
                className="w-full py-3 bg-secondary text-secondary-foreground rounded-xl shadow"
                whileTap={{ scale: 0.97 }}
              >
                📸 Открыть фото ({7 - (details.photoCount || 0)} осталось)
              </motion.button>
            )}

            {!details.hasCashCheck && (
              <motion.button
                onClick={handleCashCheck}
                className="w-full py-3 bg-secondary text-secondary-foreground rounded-xl shadow"
                whileTap={{ scale: 0.97 }}
              >
                💰 К шагу кассы
              </motion.button>
            )}

            {details.completionPercent === 100 && (
              <div className="p-3 bg-success/15 rounded-lg text-center">
                <span className="text-success text-sm font-medium">
                  ✅ Все задачи выполнены!
                </span>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={clearProgress}
                    className="text-xs text-success underline"
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
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl shadow hover:bg-primary/90"
          whileTap={{ scale: 0.97 }}
        >
          {isStarting ? "Открываю..." : "Открыть магазин"}
        </motion.button>
      )}
    </div>
  );
}
