import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

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

export function PWAInstall() {
  if (import.meta.env.DEV) return null;

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      console.log("✅ Приложение готово к офлайн-работе");
    }
    if (needRefresh) {
      console.log("♻️ Доступна новая версия, обновляем…");
      updateServiceWorker();
    }
  }, [offlineReady, needRefresh, updateServiceWorker]);

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

  if (installed || !deferredPrompt) return null;

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
 * Работает только когда приложение установлено на домашний экран.
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
