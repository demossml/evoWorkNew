// hooks/useTelegramBackButton.ts
import { useEffect } from "react";

interface BackButtonOptions {
  show?: boolean;
  onClick?: () => void;
}

export function useTelegramBackButton({
  show = true,
  onClick,
}: BackButtonOptions = {}) {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    const handler =
      onClick ||
      (() => {
        if (window.history.length > 1) {
          window.history.back();
        } else if (tg) {
          tg.close();
        } else {
          console.log("Нет страниц для возврата");
        }
      });

    if (tg?.BackButton) {
      tg.BackButton.onClick(handler);
      if (show) tg.BackButton.show();
      else tg.BackButton.hide();
    }

    const popstateHandler = () => {
      if (!tg) handler();
    };
    window.addEventListener("popstate", popstateHandler);

    return () => {
      if (tg?.BackButton) {
        tg.BackButton.offClick(handler);
        tg.BackButton.hide();
      }
      window.removeEventListener("popstate", popstateHandler);
    };
  }, [show, onClick]);
}
