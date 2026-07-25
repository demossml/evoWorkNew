/**
 * run-migrations.ts — запуск миграций БД без перезапуска сервера.
 *
 * Использование:
 *   npx tsx packages/backend/scripts/run-migrations.ts
 *
 * Безопасен для продакшена: все миграции идемпотентны.
 * Старые данные НЕ удаляются.
 */

import Database from "better-sqlite3";
import { LocalD1Database } from "../src/adapters/local-db";
import { runMigrations } from "../src/db/migrations";

const DB_PATH = process.env.DB_PATH || "/opt/evo-app/data/local.db";
const DATA_DIR = process.env.DATA_DIR || "/opt/evo-app/data";

console.log(`[migrate] База данных: ${DB_PATH}`);
console.log(`[migrate] Директория данных: ${DATA_DIR}`);

try {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = new LocalD1Database(DB_PATH);

  console.log("[migrate] Запуск миграций...");
  await runMigrations(db as any);

  // Проверяем, что таблицы создались
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];

  console.log(`[migrate] Таблицы в БД (${tables.length}):`);
  for (const t of tables) {
    const count = sqlite.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };
    console.log(`  ${t.name}: ${count.cnt} записей`);
  }

  // Проверяем настройки
  const settingsCount = sqlite.prepare("SELECT COUNT(*) as cnt FROM app_settings").get() as { cnt: number };
  console.log(`[migrate] Настроек: ${settingsCount.cnt}`);

  const subsCount = sqlite.prepare("SELECT COUNT(*) as cnt FROM push_subscriptions").get() as { cnt: number };
  console.log(`[migrate] Push-подписок: ${subsCount.cnt}`);

  sqlite.close();
  console.log("[migrate] ✅ Миграции завершены успешно.");
} catch (err) {
  console.error("[migrate] ❌ Ошибка:", err);
  process.exit(1);
}
