// db/repositories/aiRepository.ts
// Репозиторий для AI-контекста: диалоги, кеш анализов, снимки метрик.
// Все три таблицы живут в D1 — никакой векторной БД не требуется.

import type { D1Database } from "@cloudflare/workers-types";

// ═══════════════════════════════════════════════════════════════════
// Table creation
// ═══════════════════════════════════════════════════════════════════

export async function createAITables(db: D1Database): Promise<void> {
  // ai_conversations — история диалогов user↔assistant
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      context_type TEXT NOT NULL CHECK(context_type IN ('product','store')),
      entity_id TEXT,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_conv_user
      ON ai_conversations(user_id, context_type, entity_id, created_at);
  `);

  // ai_analyses — кеш AI-разборов (хеш метрик → ответ)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_type TEXT NOT NULL CHECK(context_type IN ('product','store')),
      entity_id TEXT,
      period INTEGER NOT NULL,
      metrics_hash TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_lookup
      ON ai_analyses(context_type, entity_id, period, metrics_hash);
  `);

  // ai_snapshots — еженедельные снимки метрик для сравнения
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_type TEXT NOT NULL CHECK(context_type IN ('product','store')),
      entity_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      taken_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_snapshots_entity
      ON ai_snapshots(context_type, entity_id, taken_at);
  `);
}

// ═══════════════════════════════════════════════════════════════════
// Conversations (история диалогов)
// ═══════════════════════════════════════════════════════════════════

export async function saveConversation(
  db: D1Database,
  params: {
    userId: string;
    contextType: "product" | "store";
    entityId?: string;
    role: "user" | "assistant";
    content: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_conversations (user_id, context_type, entity_id, role, content)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(params.userId, params.contextType, params.entityId ?? null, params.role, params.content)
    .run();
}

export async function getConversationHistory(
  db: D1Database,
  params: {
    userId: string;
    contextType: "product" | "store";
    entityId?: string;
    limit?: number;
  },
): Promise<{ role: "user" | "assistant"; content: string; createdAt: string }[]> {
  const limit = params.limit ?? 20;
  const rows = await db
    .prepare(
      `SELECT role, content, created_at as createdAt
       FROM ai_conversations
       WHERE user_id = ? AND context_type = ? AND (entity_id = ? OR entity_id IS NULL)
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(params.userId, params.contextType, params.entityId ?? null, limit)
    .all<{ role: "user" | "assistant"; content: string; createdAt: string }>();

  return (rows.results ?? []).reverse(); // хронологический порядок
}

export async function clearConversationHistory(
  db: D1Database,
  params: {
    userId: string;
    contextType: "product" | "store";
    entityId?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM ai_conversations
       WHERE user_id = ? AND context_type = ? AND (entity_id = ? OR entity_id IS NULL)`,
    )
    .bind(params.userId, params.contextType, params.entityId ?? null)
    .run();
}

// ═══════════════════════════════════════════════════════════════════
// Analyses cache (кеш AI-разборов)
// ═══════════════════════════════════════════════════════════════════

export async function getCachedAnalysis(
  db: D1Database,
  params: {
    contextType: "product" | "store";
    entityId?: string;
    period: number;
    metricsHash: string;
  },
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT analysis_json FROM ai_analyses
       WHERE context_type = ? AND (entity_id = ? OR entity_id IS NULL)
         AND period = ? AND metrics_hash = ?
         AND datetime(expires_at) > datetime('now')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(params.contextType, params.entityId ?? null, params.period, params.metricsHash)
    .first<{ analysis_json: string }>();

  return row?.analysis_json ?? null;
}

export async function saveCachedAnalysis(
  db: D1Database,
  params: {
    contextType: "product" | "store";
    entityId?: string;
    period: number;
    metricsHash: string;
    analysisJson: string;
    ttlHours?: number;
  },
): Promise<void> {
  const ttlHours = params.ttlHours ?? 24;
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO ai_analyses (context_type, entity_id, period, metrics_hash, analysis_json, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.contextType,
      params.entityId ?? null,
      params.period,
      params.metricsHash,
      params.analysisJson,
      expiresAt,
    )
    .run();
}

export async function cleanExpiredAnalyses(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM ai_analyses WHERE datetime(expires_at) <= datetime('now')`)
    .run();
  return result.meta?.changes ?? 0;
}

// ═══════════════════════════════════════════════════════════════════
// Snapshots (снимки метрик)
// ═══════════════════════════════════════════════════════════════════

export async function saveSnapshot(
  db: D1Database,
  params: {
    contextType: "product" | "store";
    entityId: string;
    snapshotJson: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_snapshots (context_type, entity_id, snapshot_json)
       VALUES (?, ?, ?)`,
    )
    .bind(params.contextType, params.entityId, params.snapshotJson)
    .run();
}

export async function getLatestSnapshot(
  db: D1Database,
  params: {
    contextType: "product" | "store";
    entityId: string;
    maxAgeHours?: number;
  },
): Promise<{ snapshotJson: string; takenAt: string } | null> {
  let sql = `SELECT snapshot_json as snapshotJson, taken_at as takenAt
             FROM ai_snapshots
             WHERE context_type = ? AND entity_id = ?`;
  const binds: any[] = [params.contextType, params.entityId];

  if (params.maxAgeHours) {
    const cutoff = new Date(Date.now() - params.maxAgeHours * 3600 * 1000).toISOString();
    sql += ` AND taken_at > ?`;
    binds.push(cutoff);
  }

  sql += ` ORDER BY taken_at DESC LIMIT 1`;

  return db.prepare(sql).bind(...binds).first<{ snapshotJson: string; takenAt: string }>() ?? null;
}

export async function getSnapshotAt(
  db: D1Database,
  params: {
    contextType: "product" | "store";
    entityId: string;
    weeksAgo: number;
  },
): Promise<{ snapshotJson: string; takenAt: string } | null> {
  // Ищем снимок, ближайший к дате N недель назад
  const targetDate = new Date(Date.now() - params.weeksAgo * 7 * 86400 * 1000).toISOString();

  const row = await db
    .prepare(
      `SELECT snapshot_json as snapshotJson, taken_at as takenAt
       FROM ai_snapshots
       WHERE context_type = ? AND entity_id = ? AND taken_at <= ?
       ORDER BY taken_at DESC
       LIMIT 1`,
    )
    .bind(params.contextType, params.entityId, targetDate)
    .first<{ snapshotJson: string; takenAt: string }>();

  return row ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// Utility: простой хеш для сравнения метрик
// ═══════════════════════════════════════════════════════════════════

export function hashMetrics(data: unknown): string {
  const json = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}
