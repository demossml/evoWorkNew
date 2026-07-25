/**
 * pushScheduler.ts — планировщик push-уведомлений.
 *
 * Периодически проверяет ключевые метрики и передаёт контекст
 * AI-агенту (pushAgent) для принятия решения об отправке.
 *
 * Запуск:
 *   await runPushCycle(db);
 *
 * Интегрирован в local-scheduler.ts (каждые 2 часа).
 */

import type { D1Database } from "@cloudflare/workers-types";
import { runPushAgent, type PushContext, type PushDecision } from "./pushAgent";
import { broadcastPush, getAllSubscriptions } from "./pushService";
import { getNumberSetting } from "../services/settingsService";
import { logDecision } from "./decisionLogger";

// ─── Data gathering (PushContext) ──────────────────────────────────────

async function gatherContext(db: D1Database): Promise<PushContext> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  // Временной контекст
  const nowHour = now.getUTCHours() + 3; // Москва (UTC+3) — можно определять по магазину
  const nowMinute = now.getUTCMinutes();

  // 1. Выручка сегодня vs вчера
  let revenueToday = 0, revenueYesterday = 0, refundRate = 0;
  try {
    const rowToday = await db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'SELL' THEN sellPrice * quantity ELSE 0 END), 0) as sell,
           COALESCE(SUM(CASE WHEN type = 'PAYBACK' THEN sellPrice * quantity ELSE 0 END), 0) as refund
         FROM productSold WHERE date = ?`,
      )
      .bind(today)
      .first<{ sell: number; refund: number }>();
    revenueToday = rowToday?.sell ?? 0;
    refundRate = rowToday && rowToday.sell > 0
      ? Math.round((rowToday.refund / rowToday.sell) * 100)
      : 0;

    const rowYesterday = await db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN type = 'SELL' THEN sellPrice * quantity ELSE 0 END), 0) as sell
         FROM productSold WHERE date = ?`,
      )
      .bind(yesterday)
      .first<{ sell: number }>();
    revenueYesterday = rowYesterday?.sell ?? 0;
  } catch { /* ignore */ }

  const revenueDelta = revenueYesterday > 0
    ? Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 100)
    : 0;

  // 2. План (дневной = месячный план / 30)
  const monthlyPlanAmount = await getNumberSetting(db, "bonus_plan_amount", 450);
  const dailyPlan = monthlyPlanAmount * 30;
  const planProgress = dailyPlan > 0 ? Math.round((revenueToday / dailyPlan) * 100) : 0;

  // 3. Маржа
  let marginPct = 0;
  try {
    const costRows = await db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN ps.type = 'SELL' THEN ps.sellPrice * ps.quantity ELSE 0 END), 0) as revenue,
           COALESCE(SUM(CASE WHEN ps.type = 'SELL' THEN pcp.price * ps.quantity ELSE 0 END), 0) as cost
         FROM productSold ps
         LEFT JOIN product_cost_prices pcp
           ON ps.productUuid = pcp.productName AND pcp.effectiveFrom <= ps.date
         WHERE ps.date = ?`,
      )
      .bind(today)
      .first<{ revenue: number; cost: number }>();
    if (costRows && costRows.revenue > 0) {
      marginPct = Math.round(((costRows.revenue - costRows.cost) / costRows.revenue) * 100);
    }
  } catch { /* ignore */ }

  // 4. Пороги маржи из настроек
  const marginGreen = await getNumberSetting(db, "margin_green", 30);
  const marginYellow = await getNumberSetting(db, "margin_yellow", 15);

  // 5. Мёртвый сток
  const deadStockDays = await getNumberSetting(db, "dead_stock_days", 14);
  let deadStockCount = 0;
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM (
           SELECT productUuid, MAX(date) as lastSold
           FROM productSold GROUP BY productUuid
           HAVING lastSold < date('now', ? || ' days')
         )`,
      )
      .bind(`-${deadStockDays}`)
      .first<{ cnt: number }>();
    deadStockCount = row?.cnt ?? 0;
  } catch { /* ignore */ }

  // 6. Доля аксессуаров
  const targetAccessoryShare = await getNumberSetting(db, "accessory_share_target", 12);
  let accessoryShare = 0;
  try {
    const accParents = await db
      .prepare("SELECT uuid FROM accessories")
      .all<{ uuid: string }>();
    const parentUuids = (accParents.results ?? []).map(r => r.uuid);
    if (parentUuids.length > 0 && revenueToday > 0) {
      const placeholders = parentUuids.map(() => "?").join(",");
      const accRow = await db
        .prepare(
          `SELECT COALESCE(SUM(ps.sellPrice * ps.quantity), 0) as total
           FROM productSold ps
           JOIN shopProduct sp ON ps.productUuid = sp.uuid
           WHERE ps.date = ? AND ps.type = 'SELL'
             AND sp.parentUuid IN (${placeholders})`,
        )
        .bind(today, ...parentUuids)
        .first<{ total: number }>();
      if (accRow) {
        accessoryShare = Math.round((accRow.total / revenueToday) * 100);
      }
    }
  } catch { /* ignore */ }

  // 7. Магазины с проблемами (упрощённо — все)
  let shopCount = 0;
  const shopsWithIssues: string[] = [];
  try {
    const shopRows = await db
      .prepare("SELECT uuid, name FROM shops LIMIT 10")
      .all<{ uuid: string; name: string }>();
    shopCount = (shopRows.results ?? []).length;
    shopsWithIssues.push(...(shopRows.results ?? []).map(r => r.name));
  } catch { /* ignore */ }

  return {
    today,
    nowHour,
    nowMinute,
    timezoneOffset: 3, // Москва

    revenueToday,
    revenueYesterday,
    revenueDelta,
    planProgress,
    dailyPlan,
    marginPct,
    marginGreen,
    marginYellow,
    deadStockCount,
    deadStockDays,
    accessoryShare,
    targetAccessoryShare,
    refundRate,

    shopCount,
    shopsWithIssues,
    userActiveRecently: false, // TODO: определять по наличию сессий сегодня
  };
}

// ─── Main cycle ───────────────────────────────────────────────────────

/**
 * Один цикл проверки: собираем метрики → AI принимает решение → рассылаем.
 */
export async function runPushCycle(db: D1Database): Promise<{
  decisions: PushDecision[];
  sent: number;
  failed: number;
}> {
  console.log("[push-scheduler] Запуск цикла проверки...");

  const ctx = await gatherContext(db);
  const decisions = await runPushAgent(db, ctx);

  let sent = 0, failed = 0;

  for (const d of decisions) {
    if (d.decision !== "send") continue;

    // Получаем количество подписчиков
    const allSubs = await getAllSubscriptions(db);
    d.subscriptionCount = allSubs.length;

    if (allSubs.length === 0) {
      console.log(`[push-scheduler] Нет подписчиков, "${d.title}" не отправлено`);
      continue;
    }

    const result = await broadcastPush(db, {
      title: d.title,
      body: d.body,
      icon: "/icon-192.png",
      data: d.data ?? { deepLink: d.deepLink },
    });
    sent += result.sent;
    failed += result.failed;

    if (result.sent > 0) {
      console.log(`[push-scheduler] "${d.title}" → ${result.sent} подписчиков`);
    }

    // Логируем отправку
    await logDecision(db, d);
  }

  console.log(`[push-scheduler] Цикл завершён: ${decisions.length} решений, ${sent} отправлено`);
  return { decisions, sent, failed };
}

