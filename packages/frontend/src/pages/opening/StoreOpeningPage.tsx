import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { StoreOpeningStep } from "./types";
import { useUser } from "../../hooks/userProvider";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { isTelegramMiniApp, telegram } from "../../helpers/telegram";
import { loadProgress, saveProgress } from "../../helpers/openingProgress";
import { CashCheckStep, InitialStep, PhotoStep, ProgressSteps, ShopStep } from "@widgets/opening";

export default function StoreOpeningPage() {
  const [currentStep, setCurrentStep] = useState<StoreOpeningStep>("shop");
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [selectedShopName, setSelectedShopName] = useState<string | null>(null);
  const isMiniApp = isTelegramMiniApp();

  const tg = useUser();
  const userId = tg?.id?.toString() || "";
  const userName = `${tg?.first_name ?? ""} ${tg?.last_name ?? ""}`.trim();

  useTelegramBackButton();

  // загрузка сохранённого шага
  useEffect(() => {
    const saved = loadProgress();
    const today = new Date().toISOString().slice(0, 10);

    if (saved && saved.date === today) {
      if (saved.shopUuid) {
        setSelectedShop(saved.shopUuid);
        if (saved.shopName) {
          setSelectedShopName(saved.shopName);
        }
        setCurrentStep(saved.step as StoreOpeningStep);
      } else {
        setCurrentStep("shop");
      }
    } else {
      setCurrentStep("shop");
    }
  }, []);

  // сохранение шага при изменении
  useEffect(() => {
    saveProgress(
      currentStep,
      selectedShop ?? undefined,
      selectedShopName ?? undefined,
    );
  }, [currentStep, selectedShop, selectedShopName]);

  useEffect(() => {
    if (!isMiniApp) return;
    telegram.WebApp.MainButton.hide();
  }, [isMiniApp]);

  return (
    <motion.div
      className="app-page w-full px-5 py-4 bg-background text-foreground"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        paddingBottom: "calc(var(--app-bottom-clearance, 72px) + 56px)",
        scrollPaddingBottom: "calc(var(--app-bottom-clearance, 72px) + 56px)",
      }}
    >
      <div className="max-w-xl mx-auto space-y-6">
        <ProgressSteps
          current={currentStep}
          onStepClick={(step) => {
            const order: StoreOpeningStep[] = [
              "shop",
              "initial",
              "photos",
              "cash_check",
            ];
            const currentIndex = order.indexOf(currentStep);
            const targetIndex = order.indexOf(step);
            if (targetIndex <= currentIndex) {
              setCurrentStep(step);
            }
          }}
        />

        {currentStep !== "shop" && selectedShop && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Магазин: </span>
              <span className="font-medium">
                {selectedShopName || selectedShop}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep("shop")}
              className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Сменить
            </button>
          </div>
        )}

        {!userId ? (
          <div className="p-4 rounded-lg bg-warning/10 text-warning text-sm">
            Не удалось определить пользователя. Перезапустите Mini App.
          </div>
        ) : currentStep === "shop" ? (
          <ShopStep
            userId={userId}
            selectedShop={selectedShop}
            setSelectedShop={setSelectedShop}
            setSelectedShopName={setSelectedShopName}
            onContinue={() => setCurrentStep("initial")}
          />
        ) : currentStep === "initial" ? (
          <InitialStep
            setCurrentStep={setCurrentStep}
            userId={userId}
            selectedShop={selectedShop}
            userName={userName || undefined}
          />
        ) : currentStep === "photos" ? (
          <PhotoStep
            setCurrentStep={setCurrentStep}
            userId={userId}
            selectedShop={selectedShop}
          />
        ) : (
          <CashCheckStep
            setCurrentStep={setCurrentStep}
            userId={userId}
            selectedShop={selectedShop}
          />
        )}
      </div>
    </motion.div>
  );
}
