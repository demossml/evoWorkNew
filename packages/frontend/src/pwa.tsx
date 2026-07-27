import { useEffect, useState, useRef, useCallback } from "react";

export function isPWAInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function trackInstall(outcome: "accepted" | "dismissed") {
  try {
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "pwa_install", outcome }),
    });
  } catch { /* ignore */ }
}

// ─── Ручное управление Service Worker (без useRegisterSW) ──────────────

function usePwaUpdate(onUpdateFound: () => void) {
  const cbRef = useRef(onUpdateFound);
  cbRef.current = onUpdateFound; // всегда свежий колбек

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let fired = false;

    const fire = () => {
      if (!fired) { fired = true; cbRef.current(); }
    };

    const checkReg = async (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) { fire(); return; }

      reg.addEventListener("updatefound", () => {
        const newSw = reg.installing;
        if (!newSw) return;
        newSw.addEventListener("statechange", () => {
          if (newSw.state === "installed") fire();
        });
        if (newSw.state === "installed") fire();
      });

      try { await reg.update(); } catch {}
    };

    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) checkReg(reg);
    });

    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update().catch(() => {});
      });
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);
}

export function PWAInstall() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dismissedRef = useRef(false);

  const onUpdateFound = useCallback(() => {
    if (!dismissedRef.current) setShowUpdate(true);
  }, []);

  usePwaUpdate(onUpdateFound);

  const handleLater = () => {
    setShowUpdate(false);
    setDismissed(true);
    dismissedRef.current = true;
    setTimeout(() => {
      setDismissed(false);
      dismissedRef.current = false;
    }, 60 * 60 * 1000);
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const keys = await caches.keys();
      const contentCaches = keys.filter(k =>
        k.startsWith("static-assets") ||
        k.startsWith("api-cache") ||
        k.startsWith("dashboard-cache") ||
        k.startsWith("images") ||
        k.startsWith("fonts") ||
        k.startsWith("workbox-precache")
      );
      await Promise.all(contentCaches.map(k => caches.delete(k)));

      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        await new Promise<void>((resolve) => {
          const handler = () => {
            navigator.serviceWorker.removeEventListener("controllerchange", handler);
            resolve();
          };
          navigator.serviceWorker.addEventListener("controllerchange", handler);
          setTimeout(resolve, 5000);
        });
      }

      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isPWAInstalled()) { setInstalled(true); return; }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => { setInstalled(true); setDeferredPrompt(null); });
    return () => { window.removeEventListener("beforeinstallprompt", handler); };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    trackInstall(result.outcome as "accepted" | "dismissed");
  };

  // ── Баннер обновления ──
  if (showUpdate) {
    return (
      <div className="fixed top-4 left-4 right-4 z-[100] rounded-xl bg-amber-500 p-4 text-white shadow-2xl animate-in slide-in-from-top-2">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔄</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base">Доступно обновление</h3>
            <p className="mt-0.5 text-sm text-amber-100">
              Новая версия приложения. Кэш будет очищен, данные обновятся.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleLater}
            className="flex-1 rounded-lg bg-white/20 py-2.5 text-sm font-medium hover:bg-white/30 transition"
          >
            Позже
          </button>
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="flex-1 rounded-lg bg-white py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-50 transition disabled:opacity-50"
          >
            {updating ? "Обновление..." : "Обновить"}
          </button>
        </div>
      </div>
    );
  }

  if (installed || !deferredPrompt) return null;

  // ── Установочный баннер (для не-установленных) ──
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 rounded-xl bg-primary p-4 text-primary-foreground shadow-lg">
      <h3 className="font-semibold">Установите приложение</h3>
      <p className="mt-1 text-sm opacity-90">Для быстрого доступа и работы без интернета</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setDeferredPrompt(null)} className="flex-1 rounded-lg bg-white/20 py-2 text-sm">Не сейчас</button>
        <button onClick={handleInstall} className="flex-1 rounded-lg bg-white py-2 text-sm font-semibold text-primary">Установить</button>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ─── Push-уведомления ──────────────────────────────────────────────────

export async function subscribeToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;

    // Получаем VAPID public key с сервера
    const keyResp = await fetch("/api/push/vapid-public-key");
    if (!keyResp.ok) return false;
    const { publicKey } = await keyResp.json();
    if (!publicKey) return false;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey),
    });

    // Отправляем подписку на сервер
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    return true;
  } catch {
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
  } catch { /* ignore */ }
}

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ─── Badging API ────────────────────────────────────────────────────────

/**
 * Установить бейдж на иконке PWA.
 */
export async function setAppBadge(count: number): Promise<void> {
  if ("setAppBadge" in navigator) {
    try {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch { /* ignore */ }
  }
}

// ─── Push outcome tracking ──────────────────────────────────────────────

/**
 * Сообщить серверу об outcome push-уведомления (opened/clicked/dismissed).
 * Вызывается из service worker (notificationclick) или из App при старте.
 */
export async function reportPushOutcome(title: string, outcome: "opened" | "clicked" | "dismissed"): Promise<void> {
  try {
    await fetch("/api/push/outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, outcome }),
    });
  } catch { /* ignore */ }
}
