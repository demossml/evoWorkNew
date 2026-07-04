import type { Telegram } from "@twa-dev/types";

declare global {
  interface Window {
    Telegram: Telegram;
  }
}

export const telegram = window.Telegram;

// export const isTelegramMiniApp =
//   typeof window !== "undefined" &&
//   typeof window.Telegram !== "undefined" &&
//   typeof window.Telegram.WebApp !== "undefined" &&
//   !!window.Telegram.WebApp.initDataUnsafe?.user?.id;

export const isTelegramMiniApp = () => {
  if (typeof window === "undefined") return false;

  const tg = window.Telegram;

  if (!tg || !tg.WebApp) return false;

  const intData = tg.WebApp.initData;
  const initUnsafe = tg.WebApp.initDataUnsafe;

  const hasInitData = typeof intData === "string" && intData.length > 0;

  const hasUser = !!initUnsafe?.user?.id;

  return hasInitData && hasUser;
};
