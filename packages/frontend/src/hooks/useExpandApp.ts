import { useCallback } from "react";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

export const useExpandApp = (isExpanded?: boolean) => {
  const expandApp = useCallback(() => {
    if (!isTelegramMiniApp()) return;
    if (isExpanded) return;

    telegram.WebApp.expand();
    telegram.WebApp.HapticFeedback?.impactOccurred("medium");
  }, [isExpanded]);

  return expandApp;
};
