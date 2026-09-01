import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { OpeningAnswer, OpeningPointConfig } from "./types";
import { useUser } from "../../hooks/userProvider";
import { useEmployeeRole } from "../../hooks/useApi";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { isTelegramMiniApp, telegram } from "../../helpers/telegram";
import { loadProgress, saveProgress, clearProgress } from "../../helpers/openingProgress";
import { ShopStep } from "@widgets/opening";
import { Settings } from "lucide-react";
import {
  fetchOpeningConfig,
  saveOpeningConfig,
  openStore,
  finishOpening,
} from "@features/opening/api";
import OpeningConfigEditor from "../../widgets/opening/ui/OpeningConfigEditor";
import DynamicOpeningFlow from "../../widgets/opening/ui/DynamicOpeningFlow";

export default function StoreOpeningPage() {
  const [phase, setPhase] = useState<"shop" | "run" | "config">("shop");
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [selectedShopName, setSelectedShopName] = useState<string | null>(null);
  const [config, setConfig] = useState<OpeningPointConfig | null>(null);
  const [finished, setFinished] = useState(false);
  const isMiniApp = isTelegramMiniApp();

  const tg = useUser();
  const userId = tg?.id?.toString() || "";
  const userName = `${tg?.first_name ?? ""} ${tg?.last_name ?? ""}`.trim();
  const { data: roleData } = useEmployeeRole();
  const isSuperAdmin = roleData?.employeeRole === "SUPERADMIN";

  useTelegramBackButton();

  useEffect(() => {
    let cancelled = false;
    void fetchOpeningConfig()
      .then((c) => { if (!cancelled) setConfig(c); })
      .catch(() => { if (!cancelled) setConfig(null); });
    return () => { cancelled = true; };
  }, []);

  // Восстановление магазина из progress
  useEffect(() => {
    const saved = loadProgress();
    const today = new Date().toISOString().slice(0, 10);
    if (saved && saved.date === today && saved.shopUuid) {
      setSelectedShop(saved.shopUuid);
      setSelectedShopName(saved.shopName ?? null);
    }
  }, []);

  useEffect(() => {
    saveProgress("shop", selectedShop ?? undefined, selectedShopName ?? undefined);
  }, [selectedShop, selectedShopName]);

  useEffect(() => {
    if (!isMiniApp) return;
    telegram.WebApp.MainButton.hide();
  }, [isMiniApp]);

  // Первый запуск: SUPERADMIN без завершённого setup → редактор
  useEffect(() => {
    if (config && isSuperAdmin && !config.setup_completed && phase === "shop") {
      setPhase("config");
    }
  }, [config, isSuperAdmin, phase]);

  const handleStart = async () => {
    if (!selectedShop) return;
    try {
      const today = new Date().toISOString();
      await openStore({ timestamp: today, userId, shopUuid: selectedShop, date: today.slice(0, 10), userName });
      setPhase("run");
    } catch {
      /* показать? */
    }
  };

  const handleFinish = async (answers: OpeningAnswer[]) => {
    if (!selectedShop) return;
    try {
      await finishOpening({ ok: true, discrepancy: null, userId, shopUuid: selectedShop, answers });
      clearProgress();
      setFinished(true);
    } catch {
      /* ignore */
    }
  };

  const handleSaveConfig = async (next: OpeningPointConfig) => {
    await saveOpeningConfig(next);
    setConfig(next);
    setPhase("shop");
  };

  if (!config) {
    return (
      <div className="app-page w-full px-5 py-4 bg-background text-foreground">
        <div className="max-w-xl mx-auto text-sm text-muted-foreground">Загрузка…</div>
      </div>
    );
  }

  const title = config.title || "Открытие торговой точки";

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
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-bold text-foreground">{title}</h1>
          {isSuperAdmin && phase !== "config" && (
            <button
              onClick={() => setPhase("config")}
              className="p-2 rounded-lg bg-muted text-muted-foreground"
              title="Настроить"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>

        {phase === "config" ? (
          <OpeningConfigEditor
            initial={config}
            onSave={handleSaveConfig}
            onCancel={() => setPhase(config.setup_completed ? "shop" : "shop")}
          />
        ) : finished ? (
          <div className="text-center py-8">
            <div className="text-lg font-semibold text-emerald-500">Готово</div>
            <p className="text-sm text-muted-foreground mt-1">Точка открыта</p>
          </div>
        ) : phase === "shop" ? (
          <ShopStep
            userId={userId}
            selectedShop={selectedShop}
            setSelectedShop={setSelectedShop}
            setSelectedShopName={setSelectedShopName}
            onContinue={handleStart}
          />
        ) : (
          <DynamicOpeningFlow
            config={config}
            userId={userId}
            selectedShop={selectedShop}
            onFinish={(answers) => void handleFinish(answers)}
          />
        )}
      </div>
    </motion.div>
  );
}
