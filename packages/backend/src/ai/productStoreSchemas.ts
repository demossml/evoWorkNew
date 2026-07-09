// ai/productStoreSchemas.ts
// Zod-схемы для AI-анализа товаров и магазинов

import { z } from "zod";

// ── Product ──
export const productMetricsForAI = z.object({
  productUuid: z.string(),
  productName: z.string(),
  categoryName: z.string().nullable(),
  netRevenue: z.number(),
  netQuantity: z.number(),
  grossProfit: z.number(),
  marginPct: z.number(),
  trendDirection: z.enum(["↑", "↓", "→"]),
  trendR2: z.number(),
  trendCI: z.object({ low: z.number(), high: z.number(), significant: z.boolean() }),
  cv: z.number(),
  cvVsCategory: z.number().nullable(),
  refundRate: z.number(),
  refundRateTrend: z.number(),
  storeHHI: z.number(),
  storeBreakdown: z.array(z.object({ store: z.string(), revenue: z.number(), share: z.number() })),
  basketPenetration: z.number(),
  crossSell: z.array(z.object({ productName: z.string(), affinity: z.number() })),
  abcClass: z.enum(["A", "B", "C"]),
  xyzClass: z.enum(["X", "Y", "Z"]),
  healthScore: z.number(),
  segment: z.string(),
  daysInAssortment: z.number(),
  revenueChangePct: z.number().nullable(),
  marginChangePts: z.number().nullable(),
  anomalyDays: z.array(z.object({ date: z.string(), direction: z.enum(["up", "down"]) })),
});

export const productAnalysisInput = z.object({
  products: z.array(productMetricsForAI),
  period: z.number(),
  storeContext: z.string().optional(),
});

export type ProductAnalysisInput = z.infer<typeof productAnalysisInput>;

export const productAnalysisOutput = z.object({
  executiveSummary: z.string().describe("Главный вывод по ассортименту, 1 абзац"),
  topIssues: z.array(z.object({
    product: z.string(),
    issue: z.string(),
    severity: z.enum(["critical", "warning", "info"]),
  })).describe("2-4 конкретных проблемы"),
  topOpportunities: z.array(z.object({
    product: z.string(),
    opportunity: z.string(),
    potential: z.string(),
  })).describe("2-3 возможности"),
  categoryInsight: z.string().describe("Наблюдение на уровне категорий"),
  actionableAdvice: z.array(z.string()).describe("2-3 конкретных действия"),
});

export type ProductAnalysisOutput = z.infer<typeof productAnalysisOutput>;

// ── Store ──
export const storeMetricsForAI = z.object({
  shopUuid: z.string(),
  shopName: z.string(),
  totalRevenue: z.number(),
  marginPct: z.number(),
  trendDirection: z.enum(["↑", "↓", "→"]),
  trendR2: z.number(),
  trendCI: z.object({ low: z.number(), high: z.number(), significant: z.boolean() }),
  cv: z.number(),
  cvVsNetwork: z.number().nullable(),
  rubPerHour: z.number().nullable(),
  revenuePerSeller: z.number().nullable(),
  uniqueSellers: z.number(),
  churnRate: z.number().nullable(),
  lateOpenDays: z.number(),
  openingComplianceCorrelation: z.number().nullable(),
  lateOpenRevenueImpact: z.number().nullable(),
  healthScore: z.number(),
  segment: z.string(),
  clusterLabel: z.enum(["small", "large"]).nullable(),
  revenueChangePct: z.number().nullable(),
  anomalyDays: z.array(z.object({ date: z.string(), direction: z.enum(["up", "down"]) })),
  peakHourCoverage: z.array(z.object({
    hour: z.number(), revenue: z.number(), sellers: z.number(),
    networkAvgRevenue: z.number(), networkAvgSellers: z.number(),
  })),
});

export const storeAnalysisInput = z.object({
  stores: z.array(storeMetricsForAI),
  period: z.number(),
});

export type StoreAnalysisInput = z.infer<typeof storeAnalysisInput>;

export const storeAnalysisOutput = z.object({
  executiveSummary: z.string().describe("Главный вывод по сети, 1 абзац"),
  topIssues: z.array(z.object({
    store: z.string(),
    issue: z.string(),
    severity: z.enum(["critical", "warning", "info"]),
  })).describe("2-4 конкретных проблемы"),
  topOpportunities: z.array(z.object({
    store: z.string(),
    opportunity: z.string(),
    potential: z.string(),
  })).describe("2-3 возможности"),
  disciplineInsight: z.string().describe("Вывод по дисциплине открытий"),
  actionableAdvice: z.array(z.string()).describe("2-3 конкретных действия"),
});

export type StoreAnalysisOutput = z.infer<typeof storeAnalysisOutput>;
