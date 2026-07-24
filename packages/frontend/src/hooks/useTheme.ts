import { useEffect } from "react";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";
import { TELEGRAM_BG } from "../config/theme";

export const useTheme = () => {
  useEffect(() => {
    if (isTelegramMiniApp()) {
      const WebApp = telegram.WebApp;

      const applyTheme = () => {
        const theme = WebApp.colorScheme; // "dark" | "light"
        document.documentElement.classList.toggle("dark", theme === "dark");
        WebApp.setBackgroundColor(theme === "dark" ? TELEGRAM_BG.dark : TELEGRAM_BG.light);
      };

      // Применяем сразу
      applyTheme();

      // Динамический theme-color для PWA
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      const updateMetaTheme = () => {
        const theme = WebApp.colorScheme;
        if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#080c16" : "#f9fafb");
      };
      updateMetaTheme();

      // Подписка на смену темы
      const onThemeChanged = () => { applyTheme(); updateMetaTheme(); };
      WebApp.onEvent("themeChanged", onThemeChanged);

      // Разрешаем предупреждение при закрытии
      WebApp.enableClosingConfirmation();

      return () => {
        WebApp.offEvent("themeChanged", onThemeChanged);
        WebApp.disableClosingConfirmation();
      };
    }

    // Если браузер / PWA — читаем медиа-запросы
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const applyBrowserTheme = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.setAttribute("content", mq.matches ? "#080c16" : "#f9fafb");
    };

    applyBrowserTheme();
    mq.addEventListener("change", applyBrowserTheme);

    return () => {
      mq.removeEventListener("change", applyBrowserTheme);
    };
  }, []);
};
