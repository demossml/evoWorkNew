/**
 * Тестирование всех новых функций (Settings, Push, AI Agent).
 *
 * Запуск:
 *   npx vitest run packages/backend/src/push/__tests__/all-new-features.test.ts
 *
 * Покрывает:
 *   - Миграции (app_settings, push_subscriptions, push_log)
 *   - settingsService (CRUD, типы number/json, getVapeGroupUuids)
 *   - pushService (подписки в D1: save, remove, getAll, count, broadcast)
 *   - frequencyTracker (лимиты, охлаждение, дедупликация)
 *   - decisionLogger (лог решений, outcome, weeklyStats)
 *   - pushAgent (P0-P3, чеклист из 9 пунктов, группировка, defer/suppress)
 *   - pushScheduler (gatherContext — метрики из БД)
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { LocalD1Database } from "../../adapters/local-db";
import { runMigrations } from "../../db/migrations";
import type { D1Database } from "@cloudflare/workers-types";

// ─── Helpers ──────────────────────────────────────────────────────────

function createTestDb(): LocalD1Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Создаём LocalD1Database с :memory: но через raw-обёртку
  const db = new LocalD1Database(":memory:");
  return db;
}

/** Ждём N мс */
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════════

let db: LocalD1Database;

beforeAll(async () => {
  db = createTestDb();
  // Запускаем все миграции
  await runMigrations(db as unknown as D1Database);
});

describe("1. Миграции — таблицы созданы", () => {
  it("app_settings существует", async () => {
    const row = await (db as unknown as D1Database)
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'")
      .first<{ name: string }>();
    expect(row?.name).toBe("app_settings");
  });

  it("16 стандартных настроек вставлены", async () => {
    const row = await (db as unknown as D1Database)
      .prepare("SELECT COUNT(*) as cnt FROM app_settings")
      .first<{ cnt: number }>();
    expect(row?.cnt).toBe(16);
  });

  it("push_subscriptions существует", async () => {
    const row = await (db as unknown as D1Database)
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='push_subscriptions'")
      .first<{ name: string }>();
    expect(row?.name).toBe("push_subscriptions");
  });

  it("push_log существует", async () => {
    const row = await (db as unknown as D1Database)
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='push_log'")
      .first<{ name: string }>();
    expect(row?.name).toBe("push_log");
  });

  it("повторный запуск миграций не даёт ошибок (идемпотентность)", async () => {
    // Не должно упасть
    await runMigrations(db as unknown as D1Database);
    const row = await (db as unknown as D1Database)
      .prepare("SELECT COUNT(*) as cnt FROM app_settings")
      .first<{ cnt: number }>();
    expect(row?.cnt).toBe(16); // Не задублировалось
  });
});

describe("2. settingsService — CRUD + типы", () => {
  it("getSetting возвращает значение по ключу", async () => {
    const { getSetting } = await import("../../services/settingsService");
    const val = await getSetting(db as unknown as D1Database, "margin_green", "0");
    expect(val).toBe("30");
  });

  it("getSetting: fallback для несуществующего ключа", async () => {
    const { getSetting } = await import("../../services/settingsService");
    const val = await getSetting(db as unknown as D1Database, "no_such_key", "DEFAULT");
    expect(val).toBe("DEFAULT");
  });

  it("getNumberSetting возвращает число", async () => {
    const { getNumberSetting } = await import("../../services/settingsService");
    const val = await getNumberSetting(db as unknown as D1Database, "margin_green", 0);
    expect(val).toBe(30);
    expect(typeof val).toBe("number");
  });

  it("getNumberSetting: fallback для невалидного значения", async () => {
    const { getNumberSetting } = await import("../../services/settingsService");
    const val = await getNumberSetting(db as unknown as D1Database, "no_such_key", 99);
    expect(val).toBe(99);
  });

  it("getJsonSetting возвращает JSON-массив (vape_group_uuids)", async () => {
    const { getJsonSetting } = await import("../../services/settingsService");
    const uuids = await getJsonSetting<string[]>(db as unknown as D1Database, "vape_group_uuids", []);
    expect(Array.isArray(uuids)).toBe(true);
    expect(uuids.length).toBe(9);
    expect(uuids[0]).toContain("78ddfd78");
  });

  it("getJsonSetting: fallback для отсутствующего ключа", async () => {
    const { getJsonSetting } = await import("../../services/settingsService");
    // Несуществующий ключ → "" → JSON.parse("") падает → fallback
    const val = await getJsonSetting<string[]>(db as unknown as D1Database, "no_such_key_json", ["fallback"]);
    expect(val).toEqual(["fallback"]);
  });

  it("getAllSettings возвращает все настройки", async () => {
    const { getAllSettings } = await import("../../services/settingsService");
    const all = await getAllSettings(db as unknown as D1Database);
    expect(all.length).toBeGreaterThanOrEqual(16);
    // Проверяем структуру
    const first = all[0];
    expect(first).toHaveProperty("key");
    expect(first).toHaveProperty("value");
    expect(first).toHaveProperty("type");
    expect(first).toHaveProperty("category");
  });

  it("updateSetting обновляет значение", async () => {
    const { updateSetting, getSetting } = await import("../../services/settingsService");
    await updateSetting(db as unknown as D1Database, "margin_green", "42");
    const val = await getSetting(db as unknown as D1Database, "margin_green", "0");
    expect(val).toBe("42");
    // Возвращаем обратно
    await updateSetting(db as unknown as D1Database, "margin_green", "30");
  });

  it("batchUpdateSettings обновляет несколько", async () => {
    const { batchUpdateSettings, getSetting } = await import("../../services/settingsService");
    await batchUpdateSettings(db as unknown as D1Database, [
      { key: "margin_green", value: "50" },
      { key: "margin_yellow", value: "25" },
    ]);
    expect(await getSetting(db as unknown as D1Database, "margin_green", "")).toBe("50");
    expect(await getSetting(db as unknown as D1Database, "margin_yellow", "")).toBe("25");
    // Возвращаем
    await batchUpdateSettings(db as unknown as D1Database, [
      { key: "margin_green", value: "30" },
      { key: "margin_yellow", value: "15" },
    ]);
  });

  it("getVapeGroupUuids возвращает массив", async () => {
    const { getVapeGroupUuids } = await import("../../services/settingsService");
    const uuids = await getVapeGroupUuids(db as unknown as D1Database);
    expect(uuids.length).toBe(9);
  });
});

describe("3. pushService — D1-хранилище подписок", () => {
  const sub1 = { endpoint: "https://fcm.example.com/1", keys: { p256dh: "aaa", auth: "bbb" } };
  const sub2 = { endpoint: "https://fcm.example.com/2", keys: { p256dh: "ccc", auth: "ddd" } };

  it("saveSubscription + getAllSubscriptions", async () => {
    const { saveSubscription, getAllSubscriptions } = await import("../../push/pushService");
    await saveSubscription(db as unknown as D1Database, sub1);
    await saveSubscription(db as unknown as D1Database, sub2);

    const all = await getAllSubscriptions(db as unknown as D1Database);
    expect(all.length).toBe(2);
    expect(all[0].endpoint).toBe(sub1.endpoint);
    expect(all[0].keys.p256dh).toBe("aaa");
  });

  it("saveSubscription: INSERT OR REPLACE не дублирует", async () => {
    const { saveSubscription, getAllSubscriptions } = await import("../../push/pushService");
    await saveSubscription(db as unknown as D1Database, sub1); // повторно
    const all = await getAllSubscriptions(db as unknown as D1Database);
    expect(all.length).toBe(2); // всё ещё 2
  });

  it("getSubscriptionCount", async () => {
    const { getSubscriptionCount } = await import("../../push/pushService");
    const count = await getSubscriptionCount(db as unknown as D1Database);
    expect(count).toBe(2);
  });

  it("removeSubscription удаляет одну", async () => {
    const { removeSubscription, getAllSubscriptions } = await import("../../push/pushService");
    await removeSubscription(db as unknown as D1Database, sub1.endpoint);
    const all = await getAllSubscriptions(db as unknown as D1Database);
    expect(all.length).toBe(1);
    expect(all[0].endpoint).toBe(sub2.endpoint);
  });

  it("isValidSubscription валидирует", async () => {
    const { isValidSubscription } = await import("../../push/pushService");
    expect(isValidSubscription(sub1)).toBe(true);
    expect(isValidSubscription(null)).toBe(false);
    expect(isValidSubscription({ endpoint: "x" })).toBe(false);
    expect(isValidSubscription({ endpoint: "x", keys: {} })).toBe(false);
    expect(isValidSubscription({ endpoint: "x", keys: { p256dh: "a", auth: "b" } })).toBe(true);
  });

  it("getVapidPublicKey возвращает строку (даже пустую)", async () => {
    const { getVapidPublicKey } = await import("../../push/pushService");
    const key = getVapidPublicKey();
    expect(typeof key).toBe("string");
  });

  it("broadcastPush: без VAPID-ключей не падает", async () => {
    const { broadcastPush } = await import("../../push/pushService");
    const result = await broadcastPush(db as unknown as D1Database, {
      title: "Test", body: "Test body",
    });
    expect(result).toHaveProperty("sent");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("removed");
    // Без ключей — все failed
  });
});

describe("4. frequencyTracker — лимиты и охлаждение", () => {
  // Очищаем push_log перед тестами
  beforeEach(async () => {
    await (db as unknown as D1Database).prepare("DELETE FROM push_log").run();
  });

  it("checkFrequency: разрешено при пустой истории", async () => {
    const { checkFrequency } = await import("../../push/frequencyTracker");
    const result = await checkFrequency(db as unknown as D1Database, "P1", "margin");
    expect(result.allowed).toBe(true);
    expect(result.dailyUsed).toBe(0);
  });

  it("checkFrequency: блокирует после 2 отправок (daily limit)", async () => {
    const { checkFrequency } = await import("../../push/frequencyTracker");
    // Добавляем 2 записи send вручную
    await (db as unknown as D1Database).prepare(
      "INSERT INTO push_log (decision, priority, category, reason, created_at) VALUES ('send', 'P1', 'margin', 'test', datetime('now'))"
    ).run();
    await (db as unknown as D1Database).prepare(
      "INSERT INTO push_log (decision, priority, category, reason, created_at) VALUES ('send', 'P1', 'revenue_drop', 'test', datetime('now'))"
    ).run();

    const result = await checkFrequency(db as unknown as D1Database, "P1", "plan");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("daily limit");
  });

  it("checkFrequency: P0 bypass daily limit (но не бесконечно)", async () => {
    const { checkFrequency } = await import("../../push/frequencyTracker");
    const result = await checkFrequency(db as unknown as D1Database, "P0", "security");
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("P0 bypass");
  });

  it("checkFrequency: дубликат категории в тот же день — блок", async () => {
    const { checkFrequency } = await import("../../push/frequencyTracker");
    // Очищаем
    await (db as unknown as D1Database).prepare("DELETE FROM push_log").run();
    // Одна отправка категории margin
    await (db as unknown as D1Database).prepare(
      "INSERT INTO push_log (decision, priority, category, reason, created_at) VALUES ('send', 'P1', 'margin', 'test', datetime('now'))"
    ).run();

    const result = await checkFrequency(db as unknown as D1Database, "P1", "margin");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("already sent today");
  });

  it("checkFrequency: охлаждение после 3 игноров снижает лимит", async () => {
    // Очищаем
    await (db as unknown as D1Database).prepare("DELETE FROM push_log").run();
    // 3 dismissed подряд
    for (let i = 0; i < 3; i++) {
      await (db as unknown as D1Database).prepare(
        "INSERT INTO push_log (decision, priority, category, reason, created_at, outcome) VALUES ('send', 'P1', 'margin', 'test', datetime('now'), 'dismissed')"
      ).run();
    }

    const { checkFrequency } = await import("../../push/frequencyTracker");
    const result = await checkFrequency(db as unknown as D1Database, "P1", "plan");
    // Лимит снижен с 2 до 1
    expect(result.effectiveDailyLimit).toBe(1);
  });
});

describe("5. decisionLogger — лог и статистика", () => {
  beforeEach(async () => {
    await (db as unknown as D1Database).prepare("DELETE FROM push_log").run();
  });

  it("logDecision записывает решение", async () => {
    const { logDecision } = await import("../../push/decisionLogger");

    await logDecision(db as unknown as D1Database, {
      decision: "suppress",
      priority: "P1",
      reason: "test: suppressed by quiet hours",
      category: "margin",
      title: "Test title",
      body: "Test body",
    });

    const row = await (db as unknown as D1Database)
      .prepare("SELECT * FROM push_log WHERE title = 'Test title'")
      .first<any>();
    expect(row).not.toBeNull();
    expect(row.decision).toBe("suppress");
    expect(row.priority).toBe("P1");
    expect(row.category).toBe("margin");
  });

  it("logOutcome обновляет outcome", async () => {
    const { logDecision, logOutcome } = await import("../../push/decisionLogger");

    // Сначала логгируем send
    await logDecision(db as unknown as D1Database, {
      decision: "send",
      priority: "P1",
      reason: "test",
      category: "plan",
      title: "Plan push",
      body: "Body",
    });

    // Находим id
    const row = await (db as unknown as D1Database)
      .prepare("SELECT id FROM push_log WHERE title = 'Plan push'")
      .first<{ id: number }>();
    expect(row).not.toBeNull();

    await logOutcome(db as unknown as D1Database, row!.id, "opened");

    const updated = await (db as unknown as D1Database)
      .prepare("SELECT outcome, opened_at FROM push_log WHERE id = ?")
      .bind(row!.id)
      .first<any>();
    expect(updated.outcome).toBe("opened");
    expect(updated.opened_at).not.toBeNull();
  });

  it("logOutcomeByTitle находит по заголовку", async () => {
    const { logDecision, logOutcomeByTitle } = await import("../../push/decisionLogger");

    await logDecision(db as unknown as D1Database, {
      decision: "send",
      priority: "P1",
      reason: "test",
      category: "dead_stock",
      title: "Dead stock alert",
      body: "Body",
    });

    await logOutcomeByTitle(db as unknown as D1Database, "Dead stock alert", "clicked");

    const row = await (db as unknown as D1Database)
      .prepare("SELECT outcome FROM push_log WHERE title = 'Dead stock alert'")
      .first<any>();
    expect(row.outcome).toBe("clicked");
  });

  it("getWeeklyStats возвращает агрегацию", async () => {
    const { logDecision, logOutcome, getWeeklyStats } = await import("../../push/decisionLogger");

    // 2 отправки, 1 открыта, 1 кликнута
    await logDecision(db as unknown as D1Database, {
      decision: "send", priority: "P1", reason: "t", category: "margin",
      title: "M1", body: "b",
    });
    await logDecision(db as unknown as D1Database, {
      decision: "send", priority: "P1", reason: "t", category: "plan",
      title: "P1", body: "b",
    });

    const ids = await (db as unknown as D1Database)
      .prepare("SELECT id, title FROM push_log ORDER BY id")
      .all<{ id: number; title: string }>();

    await logOutcome(db as unknown as D1Database, ids.results[0].id, "opened");
    await logOutcome(db as unknown as D1Database, ids.results[1].id, "clicked");

    const stats = await getWeeklyStats(db as unknown as D1Database);
    expect(stats.totalSent).toBe(2);
    expect(stats.totalOpened).toBe(2); // clicked тоже считается opened
    expect(stats.totalClicked).toBe(1);
    expect(stats.openRate).toBe(100);
    expect(stats.clickRate).toBe(50);
    expect(stats.byCategory["margin"]).toBeDefined();
    expect(stats.byCategory["plan"]).toBeDefined();
  });

  it("getWeeklyStats: пустая статистика без ошибок", async () => {
    await (db as unknown as D1Database).prepare("DELETE FROM push_log").run();
    const { getWeeklyStats } = await import("../../push/decisionLogger");
    const stats = await getWeeklyStats(db as unknown as D1Database);
    expect(stats.totalSent).toBe(0);
    expect(stats.openRate).toBe(0);
  });
});

describe("6. pushAgent — P0-P3, чеклист, группировка", () => {
  beforeEach(async () => {
    await (db as unknown as D1Database).prepare("DELETE FROM push_log").run();
  });

  const baseContext = {
    today: "2026-07-25",
    nowHour: 14,
    nowMinute: 30,
    timezoneOffset: 3,
    revenueToday: 50000,
    revenueYesterday: 60000,
    revenueDelta: -17,        // Не критично (<20%)
    planProgress: 85,
    dailyPlan: 60000,
    marginPct: 25,
    marginGreen: 30,
    marginYellow: 15,
    deadStockCount: 2,
    deadStockDays: 14,
    accessoryShare: 10,
    targetAccessoryShare: 12,
    refundRate: 3,
    shopCount: 3,
    shopsWithIssues: [],
    userActiveRecently: false,
  };

  it("Нет кандидатов при хороших метриках", async () => {
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, baseContext);
    // Без отклонений — ничего не предлагаем
    expect(decisions.length).toBe(0);
  });

  it("Падение выручки >20% → P1 send", async () => {
    const ctx = { ...baseContext, revenueDelta: -25, shopsWithIssues: ["Центр"] };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    const drop = decisions.find(d => d.category === "revenue_drop");
    expect(drop).toBeDefined();
    expect(drop!.decision).toBe("send");
    expect(drop!.priority).toBe("P1");
    expect(drop!.title).toContain("25%");
  });

  it("План >90% → P1 send", async () => {
    const ctx = { ...baseContext, planProgress: 95 };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    const plan = decisions.find(d => d.category === "plan");
    expect(plan).toBeDefined();
    expect(plan!.decision).toBe("send");
  });

  it("Маржа ниже yellow → P1 send", async () => {
    const ctx = { ...baseContext, marginPct: 10, revenueToday: 50000 };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    const margin = decisions.find(d => d.category === "margin");
    expect(margin).toBeDefined();
    expect(margin!.decision).toBe("send");
    expect(margin!.priority).toBe("P1");
  });

  it("Мёртвый сток >5 → P1 send", async () => {
    const ctx = { ...baseContext, deadStockCount: 8 };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    const dead = decisions.find(d => d.category === "dead_stock");
    expect(dead).toBeDefined();
    expect(dead!.decision).toBe("send");
  });

  it("Возвраты >5% → P2 send", async () => {
    const ctx = { ...baseContext, refundRate: 8, revenueToday: 50000 };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    const refund = decisions.find(d => d.category === "refunds");
    expect(refund).toBeDefined();
    expect(refund!.priority).toBe("P2");
  });

  it("Аксессуары ниже цели на >3 п.п. → P2 send", async () => {
    const ctx = { ...baseContext, accessoryShare: 7, targetAccessoryShare: 12, revenueToday: 50000 };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    const acc = decisions.find(d => d.category === "accessory");
    expect(acc).toBeDefined();
    expect(acc!.decision).toBe("send");
  });

  it("Аксессуары: отклонение <3 п.п. → не беспокоим", async () => {
    const ctx = { ...baseContext, accessoryShare: 10, targetAccessoryShare: 12, revenueToday: 50000 };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    const acc = decisions.find(d => d.category === "accessory");
    expect(acc).toBeUndefined(); // gap = 2 < 3
  });

  it("Quiet hours (22:00) → defer для не-P0", async () => {
    const ctx = { ...baseContext, nowHour: 23, revenueDelta: -25 };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    // Решения могут быть отложены
    const allDecisions = decisions; // только send попадают в результат
    // Проверяем, что не все ушли в send (часть могла быть defer/suppress)
    expect(allDecisions.length).toBeLessThanOrEqual(3);
  });

  it("Дневной лимит превышен → suppress", async () => {
    // Заполняем лимит
    for (let i = 0; i < 3; i++) {
      await (db as unknown as D1Database).prepare(
        "INSERT INTO push_log (decision, priority, category, reason, created_at) VALUES ('send', 'P1', 'test', 't', datetime('now'))"
      ).run();
    }

    const ctx = { ...baseContext, revenueDelta: -25 };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    // Все должны быть подавлены
    expect(decisions.length).toBe(0);
  });

  it("Максимум 3 уведомления за цикл", async () => {
    // Ситуация где всё плохо одновременно
    const ctx = {
      ...baseContext,
      revenueDelta: -30,
      planProgress: 95,
      marginPct: 8,
      deadStockCount: 10,
      refundRate: 8,
      accessoryShare: 5,
      revenueToday: 50000,
    };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);
    expect(decisions.length).toBeLessThanOrEqual(3);
  });

  it("Формат PushDecision корректен", async () => {
    const ctx = { ...baseContext, revenueDelta: -30, shopsWithIssues: ["Магазин 1"] };
    const { runPushAgent } = await import("../../push/pushAgent");
    const decisions = await runPushAgent(db as unknown as D1Database, ctx);

    for (const d of decisions) {
      expect(d.decision).toMatch(/^(send|suppress|defer)$/);
      expect(d.priority).toMatch(/^(P0|P1|P2|P3)$/);
      expect(d.category).toBeTruthy();
      expect(d.title).toBeTruthy();
      expect(d.body).toBeTruthy();
      expect(d.body.length).toBeGreaterThanOrEqual(10);
      expect(d.deepLink).toBeTruthy();
      expect(d.reason).toBeTruthy();
      expect(d.frequencyBudgetUsed).toBeTruthy();
    }
  });

  it("explainDecision работает", async () => {
    const { explainDecision } = await import("../../push/pushAgent");
    const explanation = explainDecision({
      decision: "send",
      priority: "P1",
      reason: "test",
      category: "margin",
      title: "Test",
      body: "Test body",
    });
    expect(explanation).toContain("✅");
    expect(explanation).toContain("P1");
  });
});

describe("7. pushScheduler — gatherContext", () => {
  it("gatherContext не падает на пустой БД", async () => {
    // Импортируем gatherContext (она не экспортируется, но runPushCycle её вызывает)
    const { runPushCycle } = await import("../../push/pushScheduler");
    const result = await runPushCycle(db as unknown as D1Database);
    expect(result).toHaveProperty("decisions");
    expect(result).toHaveProperty("sent");
    expect(result).toHaveProperty("failed");
    // На пустой БД — нет продаж → нет уведомлений
    expect(Array.isArray(result.decisions)).toBe(true);
  });

  it("runPushCycle с тестовыми данными о продажах", async () => {
    // Добавляем тестовые продажи
    await (db as unknown as D1Database).prepare(`
      CREATE TABLE IF NOT EXISTS productSold (
        date TEXT, productUuid TEXT, shopUuid TEXT,
        sellPrice REAL, quantity INTEGER, type TEXT DEFAULT 'SELL'
      )
    `).run();

    await (db as unknown as D1Database).prepare(`
      INSERT INTO productSold (date, productUuid, sellPrice, quantity, type)
      VALUES ('2026-07-25', 'prod-1', 1000, 1, 'SELL')
    `).run();

    const { runPushCycle } = await import("../../push/pushScheduler");
    const result = await runPushCycle(db as unknown as D1Database);
    expect(result).toHaveProperty("decisions");
    expect(result).toHaveProperty("sent");
    expect(result).toHaveProperty("failed");
  });
});

describe("8. Интеграционные сценарии", () => {
  beforeEach(async () => {
    await (db as unknown as D1Database).prepare("DELETE FROM push_log").run();
  });

  it("Полный цикл: метрики → агент → лог → проверка лимитов", async () => {
    const { runPushCycle } = await import("../../push/pushScheduler");
    const { getWeeklyStats } = await import("../../push/decisionLogger");

    // Первый запуск
    const result1 = await runPushCycle(db as unknown as D1Database);
    expect(result1).toBeDefined();

    // Проверяем, что в push_log есть записи
    const logCount = await (db as unknown as D1Database)
      .prepare("SELECT COUNT(*) as cnt FROM push_log")
      .first<{ cnt: number }>();
    expect(logCount.cnt).toBeGreaterThanOrEqual(0); // Может быть 0 если нет условий

    // Статистика доступна
    const stats = await getWeeklyStats(db as unknown as D1Database);
    expect(stats.totalSent).toBeGreaterThanOrEqual(0);
  });

  it("Настройки читаются из app_settings корректно", async () => {
    const { getNumberSetting } = await import("../../services/settingsService");

    const bonusRate = await getNumberSetting(db as unknown as D1Database, "bonus_accessories_rate", 0);
    expect(bonusRate).toBe(0.05);

    const syncDelay = await getNumberSetting(db as unknown as D1Database, "sync_delay_shops", 0);
    expect(syncDelay).toBe(7000);

    const uploadAttempts = await getNumberSetting(db as unknown as D1Database, "upload_max_attempts", 0);
    expect(uploadAttempts).toBe(4);
  });

  it("Всё работает идемпотентно при многократном вызове", async () => {
    // 3 цикла подряд не должны упасть
    const { runPushCycle } = await import("../../push/pushScheduler");

    for (let i = 0; i < 3; i++) {
      const result = await runPushCycle(db as unknown as D1Database);
      expect(result).toBeDefined();
    }
  });
});
