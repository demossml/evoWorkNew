/**
 * Local cron scheduler — последовательная очередь задач с разными интервалами.
 *
 *  Документы: каждые 3 минуты
 *  Магазины:   каждые 20 минут
 *  Товары:     каждые 20 минут
 *
 * Задачи выполняются строго по одной — никаких параллельных запросов к Эвотору.
 * Между задачами выдерживается пауза GAP_MS (по умолчанию 3 сек).
 *
 * Использование:
 *   npx tsx packages/backend/scripts/local-scheduler.ts
 *
 * Переменные окружения:
 *   PORT           — порт wrangler dev (по умолчанию 8787)
 *   GAP_MS         — пауза между задачами, мс (по умолчанию 3000)
 *   DOC_INTERVAL   — интервал документов, мс (по умолчанию 180000 = 3 мин)
 *   SHOP_INTERVAL  — интервал магазинов, мс (по умолчанию 1200000 = 20 мин)
 *   PROD_INTERVAL  — интервал товаров, мс (по умолчанию 1200000 = 20 мин)
 */

const PORT = process.env.PORT || 8787;
const GAP_MS = parseInt(process.env.GAP_MS || "3000");

const DOC_INTERVAL = parseInt(process.env.DOC_INTERVAL || "180000");  // 3 min
const SHOP_INTERVAL = parseInt(process.env.SHOP_INTERVAL || "1200000"); // 20 min
const PROD_INTERVAL = parseInt(process.env.PROD_INTERVAL || "1200000"); // 20 min

const BASE = `http://localhost:${PORT}/api/internal/sync`;

// ============================================================================
// Последовательная очередь
// ============================================================================

type TaskName = "documents" | "shops" | "products";

interface QueuedTask {
  name: TaskName;
  label: string;
}

const queue: QueuedTask[] = [];
const pending = new Set<TaskName>();
let running = false;

async function processQueue(): Promise<void> {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    const task = queue.shift()!;
    pending.delete(task.name);

    await runTask(task);

    // Пауза между задачами — чтобы не спамить Эвотор
    if (queue.length > 0) {
      await sleep(GAP_MS);
    }
  }

  running = false;
}

function enqueue(name: TaskName, label: string): void {
  if (pending.has(name)) {
    // Уже в очереди — не дублируем
    return;
  }
  pending.add(name);
  queue.push({ name, label });
  processQueue();
}

// ============================================================================
// Выполнение одной задачи
// ============================================================================

async function runTask(task: QueuedTask): Promise<void> {
  const time = new Date().toLocaleTimeString("ru-RU");
  console.log(`[${time}] ▶ ${task.label}...`);

  const start = performance.now();
  try {
    const res = await fetch(`${BASE}/${task.name}`, { method: "POST" });
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    if (res.ok) {
      const body = (await res.json()) as { task?: string; elapsed?: string };
      console.log(`[${time}] ✓ ${body.task || task.label} (${body.elapsed || `${elapsed}s`})`);
    } else {
      const text = await res.text();
      console.error(`[${time}] ✗ ${task.label} FAILED (${res.status}): ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(
      `[${time}] ✗ ${task.label} ERROR: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================================
// Запуск
// ============================================================================

console.log("🕐 Local sequential scheduler started");
console.log(`   Документы: каждые ${DOC_INTERVAL / 1000}s`);
console.log(`   Магазины:   каждые ${SHOP_INTERVAL / 1000}s`);
console.log(`   Товары:     каждые ${PROD_INTERVAL / 1000}s`);
console.log(`   Пауза между задачами: ${GAP_MS / 1000}s`);
console.log(`   API: ${BASE}/:task`);
console.log("");

// Первый запуск всех трёх задач при старте
enqueue("documents", "документы (initial)");
enqueue("shops", "магазины (initial)");
enqueue("products", "товары (initial)");

// Далее по расписанию
setInterval(() => enqueue("documents", "документы"), DOC_INTERVAL);
setInterval(() => enqueue("shops", "магазины"), SHOP_INTERVAL);
setInterval(() => enqueue("products", "товары"), PROD_INTERVAL);
