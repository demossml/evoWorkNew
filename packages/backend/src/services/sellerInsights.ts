/**
 * sellerInsights.ts
 *
 * Generates 3-5 AI-powered insights for a single seller.
 * Falls back to rule-based if DeepSeek is unavailable.
 *
 * Used by GET /api/sellers/insights
 */

import { deepseekChat } from "./deepseek";

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
  strengths: string[];
  weaknesses: string[];
  dnaLabel: string;
  rank: number;
  totalSellers: number;
}

// ===================== Rule-based fallback =====================

function ruleBasedInsights(p: InsightInput): string[] {
  const insights: string[] = [];

  // DNA overview
  insights.push(
    `DNA-профиль: «${p.dnaLabel}» (Score ${p.overallScore}/100, ранг ${p.rank}/${p.totalSellers}). ` +
    `За период отработано ${p.daysWorked} смен, выручка ${p.totalRevenue.toLocaleString("ru")}₽.`,
  );

  // Strengths highlight
  if (p.strengths.length > 0) {
    insights.push(
      `Сильные стороны: ${p.strengths.slice(0, 2).join("; ")}.`,
    );
  }

  // Weaknesses + recommendations
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

  // Specific metric-based insight
  if (p.deadTimePct > 20) {
    insights.push(
      `Внимание: мёртвое время составляет ${p.deadTimePct}% смены — это выше нормы. ` +
      `Рекомендуется проанализировать почасовую загрузку и перераспределить задачи.`,
    );
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

  if (p.rubPerHour != null && p.rubPerHour > 3000) {
    insights.push(
      `Высокая производительность: ${p.rubPerHour.toLocaleString("ru")}₽/час — ` +
      `значительно выше среднего. Рекомендуется рассмотреть этого продавца как наставника для новичков.`,
    );
  }

  if (p.stability.lateOpenRate > 10) {
    insights.push(
      `Дисциплина: опоздания при открытии смены — ${p.stability.lateOpenRate}% рабочих дней. ` +
      `Рекомендуется система штрафов или KPI с привязкой к пунктуальности.`,
    );
  }

  // Cap at 5
  return insights.slice(0, 5);
}

// ===================== AI-powered insights =====================

function buildSystemPrompt(): string {
  return `Ты — бизнес-аналитик сети вейп-шопов. Твоя задача — проанализировать метрики одного продавца и дать 3–5 конкретных, полезных инсайтов.

Контекст метрик:
- overallScore (0–100) — интегральный DNA-балл. >80 = отлично, 60–80 = хорошо, 40–60 = средне, <40 = проблемно.
- dnaLabel — типовая роль: Охотник (звезда), Стабильный, Одиночка, Восходящий, Проблемный.
- deadTimePct — % времени смены без продаж. Норма < 15%, > 20% = проблема.
- peakHourEfficiency (0–1) — эффективность в пиковые часы относительно среднего по магазину. >0.7 = отлично.
- trendSlope — % изменения выручки в неделю. >5% = рост, < -5% = падение.
- accShare — % аксессуаров в выручке. >25% = отлично, <15% = низко.
- avgCheck — средний чек в ₽. >1800 = высокий, <1200 = низкий.
- rubPerHour — выручка в час. >2500 = высокая производительность.
- revenueCV — коэффициент вариации дневной выручки (%). <30% = стабильно.
- lateOpenRate — % дней с опозданием на открытие. >10% = проблема.
- attendanceRate — % отработанных дней от календарных. >90% = отлично.

Формат ответа:
Верни ТОЛЬКО валидный JSON-объект. Без markdown-обёрток, без пояснений.

{
  "insights": [
    "Конкретный инсайт 1 с цифрами и рекомендацией",
    "Конкретный инсайт 2 с цифрами и рекомендацией",
    "Конкретный инсайт 3 с цифрами и рекомендацией"
  ]
}

Инсайты должны быть конкретными, содержать цифры из метрик, и давать actionable рекомендации на русском языке.
Каждый инсайт — 1-2 предложения.`;
}

function buildUserPrompt(p: InsightInput): string {
  return JSON.stringify({
    seller: {
      name: p.name,
      rank: `${p.rank}/${p.totalSellers}`,
      dnaLabel: p.dnaLabel,
      overallScore: p.overallScore,
      daysWorked: p.daysWorked,
      totalRevenue: p.totalRevenue,
      avgCheck: p.avgCheck,
      accShare: p.accShare,
      rubPerHour: p.rubPerHour,
      avgHours: p.avgHours,
      trend: p.trend,
      trendSlopePctPerWeek: p.trendSlope,
      deadTimePct: p.deadTimePct,
      peakHourEfficiency: p.peakHourEfficiency,
      revenueCV: p.stability.revenueCV,
      checkCV: p.stability.checkCV,
      attendanceRate: p.stability.attendanceRate,
      lateOpenRate: p.stability.lateOpenRate,
      strengths: p.strengths,
      weaknesses: p.weaknesses,
    },
  });
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

  // Try AI if key is available
  if (apiKey) {
    try {
      const system = buildSystemPrompt();
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
