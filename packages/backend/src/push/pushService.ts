/**
 * pushService.ts — Web Push уведомления через VAPID + web-push.
 *
 * Использует библиотеку web-push для правильного шифрования (Node.js).
 * В Cloudflare Workers web-push недоступен — push работает только на локальном сервере / Mac Mini.
 */

import type { D1Database } from "@cloudflare/workers-types";

// ─── VAPID keys ───────────────────────────────────────────────────────

let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";

let webpushLib: typeof import("web-push") | null = null;

async function getWebPush(): Promise<typeof import("web-push") | null> {
  if (webpushLib) return webpushLib;
  try {
    webpushLib = await import("web-push");
    if (vapidPublicKey && vapidPrivateKey) {
      webpushLib.setVapidDetails(
        "mailto:admin@evopulse.ru",
        vapidPublicKey,
        vapidPrivateKey,
      );
    }
    return webpushLib;
  } catch {
    console.warn("[push] web-push недоступен (Cloudflare Workers?). Push-уведомления не будут работать.");
    return null;
  }
}

// Инициализация при импорте (в Node.js окружении)
getWebPush();

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

// ─── Subscription type ────────────────────────────────────────────────

export interface PushSubscriptionStore {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ─── D1 storage ───────────────────────────────────────────────────────

export async function saveSubscription(
  db: D1Database,
  sub: PushSubscriptionStore,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, user_agent, last_used_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, "")
    .run();
}

export async function removeSubscription(
  db: D1Database,
  endpoint: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .bind(endpoint)
    .run();
}

export async function getAllSubscriptions(
  db: D1Database,
): Promise<PushSubscriptionStore[]> {
  const rows = await db
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions")
    .all<{ endpoint: string; p256dh: string; auth: string }>();
  return (rows.results ?? []).map((r) => ({
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh, auth: r.auth },
  }));
}

export async function getSubscriptionCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as cnt FROM push_subscriptions")
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

// ─── Send ─────────────────────────────────────────────────────────────

/**
 * Отправить push-уведомление на одну подписку.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionStore,
  payload: { title: string; body: string; icon?: string; data?: Record<string, unknown> },
): Promise<boolean> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[push] Ключи не настроены, уведомление не отправлено");
    return false;
  }

  const wp = await getWebPush();
  if (!wp) return false;

  try {
    await wp.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: any) {
    // 410 Gone — подписка больше не действительна
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      console.log("[push] Подписка истекла, endpoint:", subscription.endpoint);
      return false; // вызывающий код должен удалить подписку
    }
    console.error("[push] Ошибка отправки:", err?.statusCode, err?.body);
    return false;
  }
}

/**
 * Массовая рассылка push-уведомления всем подписчикам.
 * Автоматически удаляет недействительные подписки.
 */
export async function broadcastPush(
  db: D1Database,
  payload: { title: string; body: string; icon?: string; data?: Record<string, unknown> },
): Promise<{ sent: number; failed: number; removed: number }> {
  const subs = await getAllSubscriptions(db);
  let sent = 0, failed = 0, removed = 0;

  for (const sub of subs) {
    const ok = await sendPushNotification(sub, payload);
    if (ok) {
      sent++;
    } else {
      failed++;
      // Если подписка недействительна — удаляем
      await removeSubscription(db, sub.endpoint);
      removed++;
    }
  }

  console.log(`[push] Рассылка: ${sent} отправлено, ${failed} ошибок, ${removed} удалено`);
  return { sent, failed, removed };
}

/**
 * Валидация push-подписки.
 */
export function isValidSubscription(sub: unknown): sub is PushSubscriptionStore {
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
