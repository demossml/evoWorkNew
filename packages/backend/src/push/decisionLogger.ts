/**
 * decisionLogger.ts — логирование решений push-агента.
 *
 * Каждое решение (send / suppress / defer) записывается в push_log.
 * Позже подтягивается outcome (delivered / opened / clicked / dismissed).
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { PushDecision } from "./pushAgent";

// ─── Запись решения ───────────────────────────────────────────────────

export async function logDecision(
  db: D1Database,
  decision: PushDecision,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO push_log (decision, priority, reason, title, body, category, subscription_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      decision.decision,
      decision.priority,
      decision.reason,
      decision.title ?? "",
      decision.body ?? "",
      decision.category ?? "",
      decision.subscriptionCount ?? 0,
    )
    .run();
  // SQLite: lastInsertRowId не всегда доступен в D1, возвращаем 0
  return 0;
}

// ─── Обновление outcome ───────────────────────────────────────────────

export type PushOutcome = "delivered" | "opened" | "clicked" | "dismissed" | "expired";

export async function logOutcome(
  db: D1Database,
  logId: number | null,
  outcome: PushOutcome,
): Promise<void> {
  if (!logId) return;

  const now = new Date().toISOString();
  const updates: string[] = [`outcome = '${outcome}'`];

  if (outcome === "delivered") updates.push(`delivered_at = '${now}'`);
  if (outcome === "opened") updates.push(`opened_at = '${now}'`);
  if (outcome === "clicked") updates.push(`clicked_at = '${now}'`);

  await db
    .prepare(`UPDATE push_log SET ${updates.join(", ")} WHERE id = ?`)
    .bind(logId)
    .run();
}

export async function logOutcomeByTitle(
  db: D1Database,
  title: string,
  outcome: PushOutcome,
): Promise<void> {
  // Находим последнюю запись с таким заголовком
  const row = await db
    .prepare("SELECT id FROM push_log WHERE title = ? AND decision = 'send' ORDER BY id DESC LIMIT 1")
    .bind(title)
    .first<{ id: number }>();
  if (row) {
    await logOutcome(db, row.id, outcome);
  }
}

// ─── Агрегация для обучения ───────────────────────────────────────────

export interface WeeklyStats {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalDismissed: number;
  openRate: number;
  clickRate: number;
  byCategory: Record<string, { sent: number; opened: number; clicked: number }>;
}

export async function getWeeklyStats(db: D1Database): Promise<WeeklyStats> {
  const rows = await db
    .prepare(
      `SELECT decision, category, outcome, COUNT(*) as cnt
       FROM push_log
       WHERE created_at >= datetime('now', '-7 days')
       GROUP BY decision, category, outcome`,
    )
    .all<{ decision: string; category: string; outcome: string | null; cnt: number }>();

  const stats: WeeklyStats = {
    totalSent: 0, totalOpened: 0, totalClicked: 0, totalDismissed: 0,
    openRate: 0, clickRate: 0,
    byCategory: {},
  };

  for (const r of rows.results ?? []) {
    if (r.decision !== "send") continue;
    stats.totalSent += r.cnt;
    if (r.outcome === "opened" || r.outcome === "clicked") stats.totalOpened += r.cnt;
    if (r.outcome === "clicked") stats.totalClicked += r.cnt;
    if (r.outcome === "dismissed") stats.totalDismissed += r.cnt;

    if (!stats.byCategory[r.category]) {
      stats.byCategory[r.category] = { sent: 0, opened: 0, clicked: 0 };
    }
    stats.byCategory[r.category].sent += r.cnt;
    if (r.outcome === "opened" || r.outcome === "clicked") stats.byCategory[r.category].opened += r.cnt;
    if (r.outcome === "clicked") stats.byCategory[r.category].clicked += r.cnt;
  }

  stats.openRate = stats.totalSent > 0 ? Math.round((stats.totalOpened / stats.totalSent) * 100) : 0;
  stats.clickRate = stats.totalSent > 0 ? Math.round((stats.totalClicked / stats.totalSent) * 100) : 0;

  return stats;
}
