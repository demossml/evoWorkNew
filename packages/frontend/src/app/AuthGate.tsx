import { useEffect, useState, type PropsWithChildren } from "react";
import { Loader2 } from "lucide-react";
import { getAuthHeaders } from "@shared/api";
import { AuthCard } from "@/components/AuthCard";

type GateState = "loading" | "guest" | "in";

function hasTelegramContext(): boolean {
  const initData = (window as any).Telegram?.WebApp?.initData;
  if (typeof initData === "string" && initData.length > 0) return true;
  return Boolean(localStorage.getItem("telegramId"));
}

/**
 * Минимальный gate входа для PWA/браузера без Telegram.
 * Telegram WebApp / legacy telegram-id пропускаются без формы.
 */
export function AuthGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;

    // Telegram flow — не блокируем.
    if (hasTelegramContext()) {
      setState("in");
      return;
    }

    const sessionId = localStorage.getItem("sessionId");
    if (!sessionId) {
      setState("guest");
      return;
    }

    fetch("/api/auth/me", { headers: getAuthHeaders() })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setState("in");
        } else {
          localStorage.removeItem("sessionId");
          setState("guest");
        }
      })
      .catch(() => {
        if (!cancelled) setState("guest");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (state === "guest") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">Вход в кабинет</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Отчёты и аналитика сети
          </p>
        </div>
        <AuthCard redirectTo="/" />
      </div>
    );
  }

  return <>{children}</>;
}
