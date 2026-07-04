import { useEffect } from "react";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

export const useTheme = () => {
  useEffect(() => {
    if (isTelegramMiniApp()) {
      const WebApp = telegram.WebApp;

      const applyTheme = () => {
        const theme = WebApp.colorScheme; // "dark" | "light"
        document.documentElement.classList.toggle("dark", theme === "dark");
        WebApp.setBackgroundColor(theme === "dark" ? "#1f2937" : "#f3f4f6");
      };

      // Применяем сразу
      applyTheme();

      // Подписка на смену темы
      WebApp.onEvent("themeChanged", applyTheme);

      // Разрешаем предупреждение при закрытии
      WebApp.enableClosingConfirmation();

      return () => {
        WebApp.offEvent("themeChanged", applyTheme);
        WebApp.disableClosingConfirmation();
      };
    }

    // Если браузер / PWA — читаем медиа-запросы
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const applyBrowserTheme = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };

    applyBrowserTheme();
    mq.addEventListener("change", applyBrowserTheme);

    return () => {
      mq.removeEventListener("change", applyBrowserTheme);
    };
  }, []);
};
