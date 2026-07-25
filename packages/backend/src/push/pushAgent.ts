/**
 * pushAgent.ts — AI-агент push-уведомлений (полная версия).
 *
 * Анализирует бизнес-метрики и принимает решение по 9-пунктовому чеклисту.
 *
 * Приоритеты:
 *   P0 — Critical / Transactional (сбои, безопасность)
 *   P1 — High-value operational (аномалии продаж, план, маржа, мёртвый сток)
 *   P2 — Engagement & guidance (редко, только при сильном сигнале)
 *   P3 — Promotional (почти никогда)
 *
 * Принципы:
 *   - Value-first: каждое уведомление несёт ясную пользу
 *   - Relevance > volume: предпочитать event-triggered
 *   - Respect attention: 0–2 полезных в день
 *   - Timing matters: quiet hours 22:00–08:00, send-time optimization
 */

import type { D1Database } from "@cloudflare/workers-types";
import { checkFrequency, type FrequencyCheck } from "./frequencyTracker";
import { logDecision } from "./decisionLogger";

// ─── Types ─────────────────────────────────────────────────────────────

export interface PushContext {
  today: string;
  nowHour: number;            // локальный час пользователя/магазина (0–23)
  nowMinute: number;
  timezoneOffset: number;     // смещение UTC в часах (3 = Москва)

  revenueToday: number;
  revenueYesterday: number;
  revenueDelta: number;       // % изменения
  planProgress: number;       // % дневного плана
  dailyPlan: number;          // ₽

  marginPct: number;
  marginGreen: number;        // порог из настроек
  marginYellow: number;

  deadStockCount: number;
  deadStockDays: number;

  accessoryShare: number;
  targetAccessoryShare: number;

  refundRate: number;

  // Доп. контекст
  shopCount: number;
  shopsWithIssues: string[];  // имена магазинов с проблемами
  userActiveRecently: boolean; // был ли пользователь в приложении сегодня
}

export interface PushDecision {
  decision: "send" | "suppress" | "defer";
  priority: "P0" | "P1" | "P2" | "P3";
  reason: string;             // обоснование по чеклисту
  category: string;           // revenue_drop | plan | margin | dead_stock | refunds | accessory | digest

  title: string;
  body: string;
  deepLink?: string;
  data?: Record<string, unknown>;

  scheduledAt?: string;       // если defer — когда отправить
  frequencyBudgetUsed?: string; // "1/2 today, 3/6 week"
  expectedValueNotes?: string;

  // Мета
  subscriptionCount?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatRub(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

function inQuietHours(hour: number): boolean {
  return hour >= 22 || hour < 8;
}

function categoryLabel(cat: string): string {
  const m: Record<string, string> = {
    revenue_drop: "Падение выручки",
    plan: "Выполнение плана",
    margin: "Маржа",
    dead_stock: "Мёртвый сток",
    refunds: "Возвраты",
    accessory: "Аксессуары",
    digest: "Дайджест",
  };
  return m[cat] ?? cat;
}

// ─── 9-пунктовый чеклист ──────────────────────────────────────────────

interface ChecklistResult {
  passed: boolean;
  blockers: string[];
}

function runChecklist(
  decision: PushDecision,
  ctx: PushContext,
  freq: FrequencyCheck,
): ChecklistResult {
  const blockers: string[] = [];

  // 1. Есть разрешение? (предполагаем, что проверено вызывающим кодом)
  // 2. Это P0/P1/P2/P3?
  //    → уже задано в decision.priority

  // 3. Событие актуально и пользователь ещё не видел?
  if (ctx.userActiveRecently && decision.priority !== "P0") {
    blockers.push("User already active today — likely saw the data");
  }

  // 4. Не quiet hours (или исключение)?
  if (inQuietHours(ctx.nowHour) && decision.priority !== "P0") {
    blockers.push(`Quiet hours (${ctx.nowHour}:${String(ctx.nowMinute).padStart(2, "0")})`);
  }

  // 5. Не превышены дневные/недельные лимиты?
  if (!freq.allowed) {
    blockers.push(`Frequency limit: ${freq.reason}`);
  }

  // 6. Нет дубликата / можно ли сгруппировать?
  //    → handled by category dedup in frequencyTracker

  // 7. Ожидаемая польза > риск раздражения?
  //    → оцениваем эвристически: при высокой частоте или игнорах — suppress
  if (freq.dailyUsed >= freq.effectiveDailyLimit && decision.priority !== "P0") {
    blockers.push("Daily budget exhausted, low expected marginal value");
  }

  // 8. Текст конкретный, с next action и deep link?
  if (!decision.body || decision.body.length < 10) {
    blockers.push("Body too short or missing");
  }
  if (!decision.deepLink) {
    // Не блокируем, но отмечаем
  }

  // 9. Если все пункты пройдены — отправляем
  return {
    passed: blockers.length === 0,
    blockers,
  };
}

// ─── Decision functions (P1 — основные) ────────────────────────────────

function decideRevenueDrop(ctx: PushContext): PushDecision | null {
  if (ctx.revenueDelta > -20 || ctx.revenueYesterday <= 0) return null;

  const abs = Math.abs(ctx.revenueDelta);
  const shopInfo = ctx.shopsWithIssues.length > 0
    ? ` (${ctx.shopsWithIssues.slice(0, 2).join(", ")}${ctx.shopsWithIssues.length > 2 ? "…" : ""})`
    : "";

  return {
    decision: "send",
    priority: "P1",
    reason: `revenue_drop: ${abs}% below yesterday`,
    category: "revenue_drop",
    title: `📉 Выручка −${abs}% к вчера${shopInfo}`,
    body: `Сегодня ${formatRub(ctx.revenueToday)} ₽, вчера ${formatRub(ctx.revenueYesterday)} ₽. Проверьте магазины и откройте сводку.`,
    deepLink: "/",
    data: { screen: "/", type: "revenue" },
  };
}

function decidePlanProgress(ctx: PushContext): PushDecision | null {
  if (ctx.planProgress < 90 || ctx.dailyPlan <= 0) return null;

  const remaining = Math.max(0, ctx.dailyPlan - ctx.revenueToday);
  const emoji = ctx.planProgress >= 100 ? "🎯" : "📊";

  return {
    decision: "send",
    priority: "P1",
    reason: `plan_progress: ${ctx.planProgress}%`,
    category: "plan",
    title: `${emoji} План: ${ctx.planProgress}%`,
    body: ctx.planProgress >= 100
      ? `Дневной план выполнен! Выручка ${formatRub(ctx.revenueToday)} ₽.`
      : `Выручка ${formatRub(ctx.revenueToday)} ₽ из ${formatRub(ctx.dailyPlan)} ₽. Осталось ${formatRub(remaining)} ₽.`,
    deepLink: "/",
    data: { screen: "/", type: "plan" },
  };
}

function decideMargin(ctx: PushContext): PushDecision | null {
  if (ctx.marginPct >= ctx.marginYellow || ctx.marginPct <= 0 || ctx.revenueToday <= 0) return null;

  const level = ctx.marginPct < ctx.marginGreen
    ? `ниже ${ctx.marginGreen}%`
    : `ниже ${ctx.marginYellow}%`;

  return {
    decision: "send",
    priority: "P1",
    reason: `low_margin: ${ctx.marginPct}% < ${ctx.marginYellow}%`,
    category: "margin",
    title: `⚠️ Маржа ${ctx.marginPct}% — ${level}`,
    body: "Проверьте себестоимость товаров и актуальность цен 1С. Низкая маржа снижает прибыль.",
    deepLink: "/evotor/profit",
    data: { screen: "/evotor/profit", type: "margin" },
  };
}

function decideDeadStock(ctx: PushContext): PushDecision | null {
  if (ctx.deadStockCount < 5) return null;

  return {
    decision: "send",
    priority: "P1",
    reason: `dead_stock: ${ctx.deadStockCount} items > ${ctx.deadStockDays}d`,
    category: "dead_stock",
    title: `📦 Мёртвый сток: ${ctx.deadStockCount} поз.`,
    body: `Товары без продаж >${ctx.deadStockDays} дн. Проведите ревизию ассортимента — эти позиции замораживают деньги.`,
    deepLink: "/evotor/dead-stock",
    data: { screen: "/evotor/dead-stock", type: "dead_stock" },
  };
}

function decideRefundRate(ctx: PushContext): PushDecision | null {
  if (ctx.refundRate <= 5 || ctx.revenueToday <= 0) return null;

  return {
    decision: "send",
    priority: "P2", // ниже P1 — не так критично как маржа или выручка
    reason: `high_refunds: ${ctx.refundRate}%`,
    category: "refunds",
    title: `🔄 Возвраты: ${ctx.refundRate}%`,
    body: "Высокая доля возвратов сегодня. Проверьте качество товаров и работу с покупателями.",
    deepLink: "/evotor/orders",
    data: { screen: "/evotor/orders", type: "refunds" },
  };
}

function decideAccessoryShare(ctx: PushContext): PushDecision | null {
  if (ctx.accessoryShare >= ctx.targetAccessoryShare || ctx.accessoryShare <= 0 || ctx.revenueToday <= 0) return null;

  const gap = ctx.targetAccessoryShare - ctx.accessoryShare;
  if (gap < 3) return null; // незначительное отклонение — не беспокоим

  return {
    decision: "send",
    priority: "P2",
    reason: `accessory_share: ${ctx.accessoryShare}% < target ${ctx.targetAccessoryShare}%`,
    category: "accessory",
    title: `💍 Аксессуары: ${ctx.accessoryShare}% (цель ${ctx.targetAccessoryShare}%)`,
    body: `Доля аксессуаров на ${gap} п.п. ниже цели. Предлагайте сопутствующие товары — это повышает чек и маржу.`,
    deepLink: "/",
    data: { screen: "/", type: "accessory" },
  };
}

// ─── Группировка ───────────────────────────────────────────────────────

/**
 * Группирует несколько решений одной категории в одно сводное.
 * Например: «Маржа ниже 15% в 3 магазинах» вместо трёх отдельных.
 */
function groupDecisions(decisions: PushDecision[], ctx: PushContext): PushDecision[] {
  if (decisions.length <= 3) return decisions;

  // Группируем по категориям
  const byCategory = new Map<string, PushDecision[]>();
  for (const d of decisions) {
    const existing = byCategory.get(d.category) || [];
    existing.push(d);
    byCategory.set(d.category, existing);
  }

  const grouped: PushDecision[] = [];

  for (const [cat, list] of byCategory) {
    if (list.length === 1) {
      grouped.push(list[0]);
      continue;
    }

    // Несколько событий одной категории — объединяем
    const first = list[0];
    const shopNames = ctx.shopsWithIssues.length > 0
      ? ctx.shopsWithIssues.slice(0, 3).join(", ")
      : `${list.length} магазинах`;

    grouped.push({
      ...first,
      title: `${first.title.split(" (")[0]} в ${shopNames}`,
      body: `${list.length} магазинов с проблемой: "${categoryLabel(cat)}". Откройте сводку для деталей.`,
      reason: `grouped_${cat}: ${list.length} events`,
    });
  }

  return grouped;
}

// ─── P0 Critical events ────────────────────────────────────────────────

function decideP0(ctx: PushContext): PushDecision[] {
  const decisions: PushDecision[] = [];

  // Критические сбои синхронизации — здесь не определяются,
  // т.к. это требует мониторинга состояния sync. Оставлено для будущего.

  return decisions;
}

// ─── Main agent ────────────────────────────────────────────────────────

/**
 * Запустить AI-агент: собрать все candidate-решения, прогнать через чеклист,
 * отфильтровать, сгруппировать, вернуть итоговый список.
 */
export async function runPushAgent(
  db: D1Database,
  ctx: PushContext,
): Promise<PushDecision[]> {
  // 1. Собираем кандидатов
  const candidates: PushDecision[] = [];

  // P0 — критические события
  candidates.push(...decideP0(ctx));

  // P1 — операционные
  const p1Checks = [
    decideRevenueDrop,
    decidePlanProgress,
    decideMargin,
    decideDeadStock,
  ];
  for (const check of p1Checks) {
    const d = check(ctx);
    if (d) candidates.push(d);
  }

  // P2 — engagement
  const p2Checks = [decideRefundRate, decideAccessoryShare];
  for (const check of p2Checks) {
    const d = check(ctx);
    if (d) candidates.push(d);
  }

  if (candidates.length === 0) {
    console.log("[push-agent] Нет кандидатов для уведомлений.");
    return [];
  }

  // 2. Группируем
  let decisions = groupDecisions(candidates, ctx);

  // 3. Прогоняем через чеклист
  const finalDecisions: PushDecision[] = [];

  for (const d of decisions) {
    const freq = await checkFrequency(db, d.priority, d.category);

    // Формируем строку бюджета
    d.frequencyBudgetUsed = `${freq.dailyUsed}/${freq.effectiveDailyLimit} today, ${freq.weeklyUsed}/6 week`;

    const checklist = runChecklist(d, ctx, freq);

    if (checklist.passed) {
      d.decision = "send";
      d.reason = `${d.reason} | checklist: passed`;
      finalDecisions.push(d);
    } else if (inQuietHours(ctx.nowHour) && d.priority !== "P0") {
      // Откладываем до утра
      d.decision = "defer";
      d.reason = `${d.reason} | deferred: ${checklist.blockers.join("; ")}`;
      d.scheduledAt = new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() + 1,
          8 - ctx.timezoneOffset, // 8 утра по местному
          0, 0,
        ),
      ).toISOString();
      finalDecisions.push(d);
    } else {
      d.decision = "suppress";
      d.reason = `${d.reason} | suppressed: ${checklist.blockers.join("; ")}`;
    }

    // Логируем решение
    await logDecision(db, d);
  }

  // 4. Сортируем: P0 → P1 → P2 → P3
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
  finalDecisions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // 5. Не больше 3 уведомлений за раз
  const limited = finalDecisions.filter(d => d.decision === "send").slice(0, 3);

  const suppressed = finalDecisions.filter(d => d.decision === "suppress").length;
  const deferred = finalDecisions.filter(d => d.decision === "defer").length;

  console.log(
    `[push-agent] Итог: ${limited.length} send, ${deferred} defer, ${suppressed} suppress из ${candidates.length} кандидатов`,
  );

  for (const d of limited) {
    console.log(`[push-agent] ▶ ${d.priority} ${d.category}: ${d.title}`);
  }
  for (const d of finalDecisions.filter(x => x.decision === "suppress")) {
    console.log(`[push-agent] ✕ ${d.category}: ${d.reason}`);
  }

  return limited;
}

/**
 * Объяснить решение — для отладки и UI.
 */
export function explainDecision(d: PushDecision): string {
  const emoji = d.decision === "send" ? "✅" : d.decision === "defer" ? "⏳" : "❌";
  return `${emoji} [${d.priority}] ${d.category}: ${d.title} — ${d.reason}`;
}

