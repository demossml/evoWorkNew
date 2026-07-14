/**
 * sellerInsights.ts
 *
 * Generates 3-5 AI-powered insights for a single seller.
 * When comparison context (store + peers) is provided, answers
 * focus on store-level peer comparison rather than generic advice.
 *
 * Used by GET /api/sellers/insights
 */

import { deepseekChat } from "./deepseek";

// ===================== Types =====================

interface PeerSummary {
  name: string;
  overallScore: number;
  avgCheck: number;
  rubPerHour: number | null;
  accShare: number;
  deadTimePct: number;
  rank: number;
}

export interface ComparisonContext {
  shopName?: string;
  peers?: PeerSummary[];
  totalSellers?: number;
}

// Minimal profile shape needed for insights
interface InsightInput {
  name: string;
  daysWorked: number;
  totalRevenue: number;
  avgCheck: number;
  accShare: number;
  rubPerHour: number | null;
  avgHours: number | null;
  trend: "up" | "down" | "stable";
  trendSlope: number;
  overallScore: number;
  deadTimePct: number;
  peakHourEfficiency: number;
  stability: {
    revenueCV: number;
    checkCV: number;
    attendanceRate: number;
    lateOpenRate: number;
  };
  avgLateMinutes: number;
  lateRate: number;
  onTimeRate: number;
  firstCheckDelay: number | null;
  absentRate: number;
  historicalNotes?: string;
  strengths: string[];
  weaknesses: string[];
  dnaLabel: string;
  rank: number;
  totalSellers: number;
  comparison?: ComparisonContext;
}

// ===================== Rule-based fallback =====================

function ruleBasedInsights(p: InsightInput): string[] {
  const insights: string[] = [];
  const peers = p.comparison?.peers ?? [];
  const shopName = p.comparison?.shopName;
  const hasComparison = peers.length >= 2 && shopName;

  // DNA overview — contextual
  const location = shopName ? `в магазине «${shopName}»` : "";
  insights.push(
    `DNA-профиль ${location}: «${p.dnaLabel}» (Score ${p.overallScore}/100, ранг ${p.rank}/${p.totalSellers}). ` +
    `Отработано ${p.daysWorked} смен, выручка ${p.totalRevenue.toLocaleString("ru")}₽.`,
  );

  // Comparison insights — when peers available
  if (hasComparison) {
    const topByScore = [...peers].sort((a, b) => b.overallScore - a.overallScore);
    const best = topByScore[0];
    const isLeader = best.name === p.name;
    const topByRub = [...peers].sort((a, b) => (b.rubPerHour ?? 0) - (a.rubPerHour ?? 0));
    const bestRub = topByRub[0];

    if (!isLeader) {
      const gap = best.overallScore - p.overallScore;
      if (gap > 8) {
        insights.push(
          `${p.name} отстаёт от лидера «${best.name}» на ${gap} баллов DNA Score. ` +
          `Основной разрыв: ${best.rubPerHour != null && p.rubPerHour != null ? `выручка/час ${p.rubPerHour.toLocaleString("ru")}₽ vs ${best.rubPerHour.toLocaleString("ru")}₽` : "метрики эффективности"}.`,
        );
      }

      if (bestRub && bestRub.name !== p.name && bestRub.rubPerHour != null && p.rubPerHour != null && bestRub.rubPerHour > p.rubPerHour * 1.15) {
        const pct = Math.round((bestRub.rubPerHour / p.rubPerHour - 1) * 100);
        insights.push(
          `${bestRub.name} превосходит ${p.name} на ${pct}% по выручке в час ` +
          `(${bestRub.rubPerHour.toLocaleString("ru")}₽ vs ${p.rubPerHour.toLocaleString("ru")}₽). ` +
          `Рекомендация: проанализировать технику работы ${bestRub.name} и перенять лучшие практики.`,
        );
      }

      if (best.accShare > p.accShare + 8) {
        insights.push(
          `В магазине «${shopName}» ${best.name} продаёт аксессуары с долей ${best.accShare}% vs ${p.accShare}% у ${p.name}. ` +
          `Рекомендация: перенять технику предложения доп. товаров.`,
        );
      }

      if (p.deadTimePct > 20 && peers.some(pr => pr.deadTimePct < 15)) {
        const lowDead = peers.filter(pr => pr.deadTimePct < 15).map(pr => pr.name).join(", ");
        insights.push(
          `Мёртвое время ${p.name}: ${p.deadTimePct}% против нормы <15%. ` +
          `У ${lowDead} этот показатель в норме — стоит изучить их подход к управлению сменами.`,
        );
      }
    } else {
      // This seller IS the leader
      const second = topByScore.length > 1 ? topByScore[1] : null;
      if (second) {
        const gap = p.overallScore - second.overallScore;
        insights.push(
          `${p.name} — лидер среди продавцов «${shopName}» с отрывом ${gap} баллов. ` +
          `Рекомендация: масштабировать практики ${p.name} на остальных через наставничество.`,
        );
      }
    }
  } else if (p.strengths.length > 0) {
    // Standalone: generic strengths
    insights.push(
      `Сильные стороны: ${p.strengths.slice(0, 2).join("; ")}.`,
    );
  }

  // Weaknesses + recommendations — standalone only
  if (!hasComparison) {
    if (p.weaknesses.length > 0) {
      const topWeak = p.weaknesses.slice(0, 2);
      const recs: string[] = [];
      for (const w of topWeak) {
        if (w.includes("мёртвого времени")) {
          recs.push("пересмотреть расписание смен для снижения простоев");
        } else if (w.includes("чеков") || w.includes("чек")) {
          recs.push("провести тренинг по допродажам аксессуаров");
        } else if (w.includes("тренд") || w.includes("выручки")) {
          recs.push("проанализировать причины снижения и усилить мотивацию");
        } else if (w.includes("пики")) {
          recs.push("оптимизировать график под часы пиковой нагрузки");
        } else if (w.includes("аксессуаров")) {
          recs.push("внедрить скрипты допродаж аксессуаров");
        } else if (w.includes("посещаемость")) {
          recs.push("провести беседу о дисциплине и важности стабильного графика");
        } else if (w.includes("Опоздания")) {
          recs.push("ужесточить контроль времени открытия смен");
        }
      }
      const recText = recs.length > 0
        ? `Рекомендации: ${recs.join("; ")}.`
        : `Рекомендуется детальный разбор метрик с руководителем.`;
      insights.push(
        `Зоны роста: ${topWeak.join("; ")}. ${recText}`,
      );
    } else {
      insights.push(
        `Явных зон роста не выявлено. Рекомендуется поддерживать текущий уровень и масштабировать успешные практики.`,
      );
    }
  }

  // Specific metric-based insight
  if (p.deadTimePct > 20) {
    if (!hasComparison) {
      insights.push(
        `Внимание: мёртвое время составляет ${p.deadTimePct}% смены — это выше нормы. ` +
        `Рекомендуется проанализировать почасовую загрузку и перераспределить задачи.`,
      );
    }
  }

  if (p.trend === "up" && p.trendSlope > 5) {
    insights.push(
      `Позитивный тренд: выручка растёт на ${p.trendSlope}% в неделю. ` +
      `Рекомендуется закрепить успех — проанализировать, что именно работает, и усилить это направление.`,
    );
  } else if (p.trend === "down") {
    insights.push(
      `Тревожный сигнал: выручка снижается на ${Math.abs(p.trendSlope)}% в неделю. ` +
      `Необходимо срочно выявить причину — проверить мотивацию, график, качество обслуживания.`,
    );
  }

  if (p.peakHourEfficiency < 0.3) {
    insights.push(
      `Эффективность в пиковые часы низкая (${Math.round(p.peakHourEfficiency * 100)}% от среднего по магазину). ` +
      `Рекомендуется усилить присутствие в часы максимального трафика.`,
    );
  }

  if (p.rubPerHour != null && p.rubPerHour > 3000 && !hasComparison) {
    insights.push(
      `Высокая производительность: ${p.rubPerHour.toLocaleString("ru")}₽/час — ` +
      `значительно выше среднего. Рекомендуется рассмотреть этого продавца как наставника для новичков.`,
    );
  }

  if (p.stability.lateOpenRate > 10) {
    insights.push(
      `Дисциплина: опоздания при открытии смены — ${p.stability.lateOpenRate}% рабочих дней ` +
      `(в среднем на ${p.avgLateMinutes} мин). ` +
      `Рекомендуется система штрафов или KPI с привязкой к пунктуальности.`,
    );
  }

  if (p.absentRate > 15) {
    insights.push(
      `Критическая дисциплина: ${p.absentRate}% рабочего времени приходится на подозрительные периоды без чеков. ` +
      `Рекомендуется проверить камеры видеонаблюдения и провести беседу с продавцом.`,
    );
  } else if (p.absentRate > 5) {
    insights.push(
      `Внимание: ${p.absentRate}% времени смены занимают периоды без чеков с высокой вероятностью отсутствия. ` +
      `Следует уточнить причины и усилить контроль.`,
    );
  }

  if (p.onTimeRate >= 95 && p.daysWorked >= 10) {
    insights.push(
      `Отличная пунктуальность: ${p.onTimeRate}% смен начаты вовремя. ` +
      `Продавец задаёт стандарт дисциплины для команды.`,
    );
  }

  if (p.firstCheckDelay != null) {
    if (p.firstCheckDelay > 30) {
      insights.push(
        `Медленный старт: в среднем ${p.firstCheckDelay} мин до первого чека после открытия. ` +
        `Рекомендуется подготовка рабочего места до открытия смены.`,
      );
    } else if (p.firstCheckDelay < 10) {
      insights.push(
        `Быстрый старт: первый чек в среднем через ${p.firstCheckDelay} мин после открытия — отличный показатель.`,
      );
    }
  }

  // Cap at 5
  return insights.slice(0, 5);
}

// ===================== AI-powered insights =====================

function buildSystemPrompt(comparison?: ComparisonContext): string {
  const hasComparison = comparison?.peers && comparison.peers.length >= 2 && comparison?.shopName;

  const base = `Ты — опытный супервайзер сети вейп-шопов.
Твоя задача — дать честный, конкретный и полезный анализ продавца на основе его метрик и исторического поведения.

Учитывай:
- lateRate (процент опозданий) и absentRate (процент подозрительных отсутствий).
- firstCheckDelay (как быстро входит в работу).
- peakHourEfficiency (работает ли в самое важное время).
- accShare (умение продавать доп. товары).
- Общее поведение за последние 30–90 дней.

Правила:
- Если lateRate > 20% или absentRate > 15% — обязательно дай рекомендацию по дисциплине.
- Всегда учитывай историческое поведение (например, "Иван стабильно опаздывает по средам").
- Рекомендации должны быть конкретными и actionable.
- Не используй общие фразы типа "нужно работать лучше". Пиши, что именно делать владельцу/менеджеру.

Формат ответа — JSON:
{
  "insights": [
    "Короткое предложение 1",
    "Короткое предложение 2",
    ...
  ]
}

Каждый инсайт — 1-2 предложения на русском языке.`;

  if (hasComparison) {
    return base + `

ВАЖНО — КОНТЕКСТ СРАВНЕНИЯ:
В запросе будет поле "comparison" с метриками других продавцов из ТОГО ЖЕ магазина.
Ты должен:
1. Сравнивать продавца с его коллегами в этом магазине, называя конкретные имена.
2. Указывать, кто лучший и на сколько процентов/баллов.
3. Давать конкретную рекомендацию: что именно стоит перенять у лидера.
4. Анализировать именно различия между продавцами, а не общие советы.`;
  }

  return base;
}

function buildUserPrompt(p: InsightInput): string {
  const shopName = p.comparison?.shopName || "не указан";
  const historicalNotes = p.historicalNotes || "нет данных";

  const prompt = [
    `Продавец: ${p.name} (${p.dnaLabel})`,
    `Магазин: ${shopName}`,
    `Период: ${p.daysWorked} смен`,
    ``,
    `Ключевые метрики:`,
    `- DNA Score: ${p.overallScore}/100`,
    `- Выручка/час: ${p.rubPerHour != null ? p.rubPerHour.toLocaleString("ru") + " ₽" : "—"}`,
    `- Средний чек: ${p.avgCheck} ₽`,
    `- % аксессуаров: ${p.accShare}%`,
    `- % опозданий: ${p.lateRate}%`,
    `- % подозрительных отсутствий: ${p.absentRate}%`,
    `- Эффективность в пиковые часы: ${Math.round(p.peakHourEfficiency * 100)}%`,
    `- Среднее время до первого чека: ${p.firstCheckDelay != null ? p.firstCheckDelay + " мин" : "—"}`,
    `- Тренд: ${p.trend} (${p.trendSlope}%/нед)`,
    `- CV выручки: ${p.stability.revenueCV}%`,
    `- Посещаемость: ${p.stability.attendanceRate}%`,
    ``,
    `Историческое поведение: ${historicalNotes}`,
    ``,
    `Проанализируй и дай 3–5 конкретных инсайтов.`,
  ].join("\n");

  if (p.comparison?.peers && p.comparison.peers.length >= 2 && p.comparison.shopName) {
    const peerLines = p.comparison.peers
      .filter((pr) => pr.name !== p.name)
      .map((peer) =>
        `  - ${peer.name}: DNA ${peer.overallScore}/100, чек ${peer.avgCheck}₽, руб/ч ${peer.rubPerHour ?? "—"}₽, аксы ${peer.accShare}%, мёртвое время ${peer.deadTimePct}%`
      );
    return prompt + `\n\nКоллеги в магазине "${p.comparison.shopName}":\n${peerLines.join("\n")}`;
  }

  return prompt;
}

function parseAIResponse(text: string): string[] {
  // Strip markdown wrappers
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7).trim();
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3).trim();
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3).trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed.insights)) {
      return parsed.insights.filter((s: unknown) => typeof s === "string" && s.length > 0);
    }
  } catch {
    // Fall through to line-based extraction
  }

  // Best-effort: extract quoted strings or bullet lines
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length > 20);
  return lines.slice(0, 5);
}

// ===================== Main export =====================

export interface GenerateInsightsParams {
  profile: InsightInput;
  apiKey: string | undefined;
}

export async function generateSellerInsights(
  params: GenerateInsightsParams,
): Promise<{ insights: string[] }> {
  const { profile, apiKey } = params;
  const comparison = profile.comparison;

  // Try AI if key is available
  if (apiKey) {
    try {
      const system = buildSystemPrompt(comparison);
      const user = buildUserPrompt(profile);
      const aiText = await deepseekChat({
        apiKey,
        system,
        user,
        model: "deepseek-chat",
        maxTokens: 1024,
        temperature: 0.4,
      });
      const insights = parseAIResponse(aiText);
      if (insights.length >= 2) {
        return { insights: insights.slice(0, 5) };
      }
    } catch (err: any) {
      console.warn("[seller-insights] DeepSeek unavailable, using rule-based:", err.message);
    }
  }

  // Rule-based fallback
  return { insights: ruleBasedInsights(profile) };
}
