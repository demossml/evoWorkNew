/**
 * frequencyTracker.ts — контроль частоты push-уведомлений.
 *
 * Правила (из промпта агента):
 * - Макс. 1–2 уведомления в день (суммарно P1+P2)
 * - Макс. 5–7 в неделю
 * - Охлаждение после игноров: снижать лимит
 * - После opt-out категории — не отправлять без re-opt-in
 * - P0 может превышать лимиты
 */

import type { D1Database } from "@cloudflare/workers-types";

// ─── Конфигурация (можно вынести в app_settings) ─────────────────────

const MAX_DAILY_P1_P2 = 2;
const MAX_WEEKLY_P1_P2 = 6;
const COOLDOWN_AFTER_IGNORES = 3; // после N игноров подряд — снижаем лимит

// ─── Запросы к push_log ───────────────────────────────────────────────

interface PushLogRow {
  decision: string;
  priority: string;
  category: string;
  created_at: string;
  outcome: string | null;
}

/** Сколько уведомлений category отправлено сегодня (UTC) */
async function countToday(db: D1Database, category?: string): Promise<number> {
  const cond = category
    ? "AND category = ?"
    : "";
  const params = category ? [category] : [];
  const row = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM push_log
       WHERE decision = 'send' AND date(created_at) = date('now') ${cond}`,
    )
    .bind(...params)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

/** Сколько уведомлений отправлено за последние 7 дней */
async function countWeek(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM push_log
       WHERE decision = 'send' AND created_at >= datetime('now', '-7 days')`,
    )
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

/** Последние N записей (для проверки игноров) */
async function recentDecisions(db: D1Database, limit: number): Promise<PushLogRow[]> {
  const rows = await db
    .prepare(
      `SELECT decision, priority, category, created_at, outcome
       FROM push_log ORDER BY id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<PushLogRow>();
  return rows.results ?? [];
}

/** Число подряд идущих игноров (dismissed / не открыто) */
async function consecutiveIgnores(db: D1Database): Promise<number> {
  const rows = await recentDecisions(db, 10);
  let count = 0;
  for (const r of rows) {
    if (r.outcome === "dismissed" || (r.decision === "send" && !r.outcome)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ─── Проверки ─────────────────────────────────────────────────────────

export interface FrequencyCheck {
  allowed: boolean;
  reason: string;       // почему нельзя или "ok"
  dailyUsed: number;
  weeklyUsed: number;
  dailyLimit: number;
  effectiveDailyLimit: number; // с учётом охлаждения
}

/**
 * Проверить, можно ли отправить уведомление данного приоритета и категории.
 */
export async function checkFrequency(
  db: D1Database,
  priority: string,
  category: string,
): Promise<FrequencyCheck> {
  const dailyUsed = await countToday(db);
  const categoryDailyUsed = await countToday(db, category);
  const weeklyUsed = await countWeek(db);
  const ignores = await consecutiveIgnores(db);

  // Базовый дневной лимит
  let effectiveLimit = MAX_DAILY_P1_P2;

  // Охлаждение после игноров
  if (ignores >= COOLDOWN_AFTER_IGNORES) {
    effectiveLimit = Math.max(1, effectiveLimit - 1);
  }

  // P0 не ограничен дневным лимитом (но всё равно не бесконечно)
  if (priority === "P0") {
    // P0 всё равно не чаще 5 в день
    if (dailyUsed >= 5) {
      return { allowed: false, reason: "P0 limit exceeded (5/day)", dailyUsed, weeklyUsed, dailyLimit: MAX_DAILY_P1_P2, effectiveDailyLimit: 5 };
    }
    return { allowed: true, reason: "P0 bypass", dailyUsed, weeklyUsed, dailyLimit: MAX_DAILY_P1_P2, effectiveDailyLimit: 5 };
  }

  // Дневной лимит
  if (dailyUsed >= effectiveLimit) {
    return { allowed: false, reason: `daily limit reached (${dailyUsed}/${effectiveLimit})`, dailyUsed, weeklyUsed, dailyLimit: MAX_DAILY_P1_P2, effectiveDailyLimit: effectiveLimit };
  }

  // Недельный лимит
  if (weeklyUsed >= MAX_WEEKLY_P1_P2) {
    return { allowed: false, reason: `weekly limit reached (${weeklyUsed}/${MAX_WEEKLY_P1_P2})`, dailyUsed, weeklyUsed, dailyLimit: MAX_DAILY_P1_P2, effectiveDailyLimit: effectiveLimit };
  }

  // Дубликат категории сегодня?
  if (categoryDailyUsed >= 1 && priority !== "P0") {
    return { allowed: false, reason: `category "${category}" already sent today`, dailyUsed, weeklyUsed, dailyLimit: MAX_DAILY_P1_P2, effectiveDailyLimit: effectiveLimit };
  }

  return { allowed: true, reason: "ok", dailyUsed, weeklyUsed, dailyLimit: MAX_DAILY_P1_P2, effectiveDailyLimit: effectiveLimit };
}
