import { syncDocuments } from "./src/sync/cron";
import { LocalD1Database } from "./src/adapters/local-db";
import { readFileSync } from "fs";
import path from "path";

// Read token from .dev.vars
const devVars = readFileSync(path.join(__dirname, ".dev.vars"), "utf-8");
const tokenMatch = devVars.match(/EVOTOR_API_TOKEN=(.+)/);
const TOKEN = tokenMatch ? tokenMatch[1].trim() : "";

if (!TOKEN) {
  console.error("[manual] Токен не найден в .dev.vars");
  process.exit(1);
}

const DB_PATH =
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/77e38069f80f1e633c9f5aa7772a284a52b432b7fafc0a93a3719afdd1326ebf.sqlite";
const db = new LocalD1Database(DB_PATH);

console.log("[manual] Запуск ручной синхронизации за 90 дней...");
syncDocuments({ EVOTOR_API_TOKEN: TOKEN, DB: db as any })
  .then(() => {
    console.log("[manual] Готово.");
    process.exit(0);
  })
  .catch((e: any) => {
    console.error("[manual] Ошибка:", e.message);
    process.exit(1);
  });
