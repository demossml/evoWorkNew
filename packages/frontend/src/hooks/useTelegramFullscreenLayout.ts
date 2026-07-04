import { useEffect } from "react";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

type Inset = {
  top?: number;
  bottom?: number;
};

type TelegramWebAppWithSafeArea = {
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: Inset;
  contentSafeAreaInset?: Inset;
  onEvent: (event: string, cb: () => void) => void;
  offEvent: (event: string, cb: () => void) => void;
};

const setCssVar = (name: string, value: string) => {
  document.documentElement.style.setProperty(name, value);
};

const TELEGRAM_TOP_CONTROLS_FALLBACK = 48;

const readInset = (value: number | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
};

export const useTelegramFullscreenLayout = () => {
  useEffect(() => {
    const applyFallback = () => {
      setCssVar("--tg-safe-top", "0px");
      setCssVar("--tg-safe-bottom", "0px");
      setCssVar("--tg-viewport-height", `${window.innerHeight}px`);
      setCssVar("--tg-app-top-offset", "0px");
    };

    const applyFromTelegram = () => {
      const webApp = telegram.WebApp as unknown as TelegramWebAppWithSafeArea;
      const contentInset = webApp.contentSafeAreaInset;
      const safeInset = webApp.safeAreaInset;

      const safeTop = readInset(contentInset?.top ?? safeInset?.top);
      const contentTop = readInset(contentInset?.top);
      const safeBottom = readInset(contentInset?.bottom ?? safeInset?.bottom);
      const viewportHeight = Math.round(
        webApp.viewportStableHeight ?? webApp.viewportHeight ?? window.innerHeight
      );
      // Some Telegram clients do not expose contentSafeAreaInset correctly.
      // In that case, add a fallback offset for the native top controls.
      const appTopOffset =
        contentTop > safeTop + 8
          ? contentTop
          : Math.max(safeTop + TELEGRAM_TOP_CONTROLS_FALLBACK, safeTop);

      setCssVar("--tg-safe-top", `${safeTop}px`);
      setCssVar("--tg-safe-bottom", `${safeBottom}px`);
      setCssVar("--tg-viewport-height", `${Math.max(0, viewportHeight)}px`);
      setCssVar("--tg-app-top-offset", `${appTopOffset}px`);
    };

    const isMiniApp = isTelegramMiniApp();

    if (!isMiniApp) {
      applyFallback();
      const handleResize = () => applyFallback();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const webApp = telegram.WebApp as unknown as TelegramWebAppWithSafeArea;
    const handleViewportUpdate = () => applyFromTelegram();
    const handleVisualViewportUpdate = () => applyFromTelegram();

    applyFromTelegram();

    webApp.onEvent("viewportChanged", handleViewportUpdate);
    webApp.onEvent("safeAreaChanged", handleViewportUpdate);
    webApp.onEvent("contentSafeAreaChanged", handleViewportUpdate);
    window.addEventListener("resize", handleViewportUpdate);
    window.visualViewport?.addEventListener("resize", handleVisualViewportUpdate);
    window.visualViewport?.addEventListener("scroll", handleVisualViewportUpdate);

    return () => {
      webApp.offEvent("viewportChanged", handleViewportUpdate);
      webApp.offEvent("safeAreaChanged", handleViewportUpdate);
      webApp.offEvent("contentSafeAreaChanged", handleViewportUpdate);
      window.removeEventListener("resize", handleViewportUpdate);
      window.visualViewport?.removeEventListener(
        "resize",
        handleVisualViewportUpdate
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        handleVisualViewportUpdate
      );
    };
  }, []);
};
