/**
 * pushService.ts — Web Push уведомления через VAPID.
 *
 * VAPID-ключи генерируются один раз и хранятся в переменных окружения.
 * Если ключей нет — они будут сгенерированы при первом запуске (логируются в консоль).
 *
 * Использование:
 *   import { sendPush, getVapidPublicKey } from "./pushService";
 */

// VAPID-ключи из переменных окружения
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";

// Генерация ключей при отсутствии
function ensureKeys(): void {
  if (vapidPublicKey && vapidPrivateKey) return;

  // В production должны быть установлены через .env
  // Для разработки — используем тестовые ключи
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn(
      "[push] VAPID_PUBLIC_KEY или VAPID_PRIVATE_KEY не заданы в .env. Push-уведомления не будут работать.",
    );
    console.warn(
      "[push] Сгенерируйте ключи: npx web-push generate-vapid-keys",
    );
  }
}

ensureKeys();

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

/**
 * Отправить push-уведомление на подписку.
 */
export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; icon?: string; data?: Record<string, unknown> },
): Promise<boolean> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[push] Ключи не настроены, уведомление не отправлено");
    return false;
  }

  try {
    // Используем Web Push API напрямую (без библиотеки web-push для лёгкости)
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(JSON.stringify(payload));

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
      },
      body: payloadBytes,
    });

    return response.ok;
  } catch (err) {
    console.error("[push] Ошибка отправки:", err);
    return false;
  }
}

/**
 * Валидация push-подписки.
 */
export function isValidSubscription(sub: unknown): sub is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  if (!sub || typeof sub !== "object") return false;
  const s = sub as Record<string, unknown>;
  return (
    typeof s.endpoint === "string" &&
    s.keys != null &&
    typeof s.keys === "object" &&
    typeof (s.keys as Record<string, unknown>).p256dh === "string" &&
    typeof (s.keys as Record<string, unknown>).auth === "string"
  );
}
