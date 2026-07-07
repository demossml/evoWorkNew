import { z } from "zod";

// ── Input: seller metrics for LLM analysis ──
export const sellerMetricsForAI = z.object({
  name: z.string(),
  daysWorked: z.number(),
  totalChecks: z.number(),
  avgDailyRev: z.number(),
  avgCheck: z.number(),
  trendSlope: z.number(),
  cv: z.number(),
  vapeShare: z.number(),
  accShare: z.number(),
  liquidShare: z.number(),
  unknownItemsPct: z.number(),
  rubPerHour: z.number().nullable(),
  planCompletion: z.number().nullable(),
  segment: z.string(),
  stores: z.array(z.string()),
});

export const sellerAnalysisInput = z.object({
  sellers: z.array(sellerMetricsForAI),
  period: z.number(),
  storeContext: z.string(),
});

export type SellerAnalysisInput = z.infer<typeof sellerAnalysisInput>;

// ── Output: structured LLM response ──
export const sellerInsight = z.object({
  sellerName: z.string(),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  risks: z.array(z.string()),
  concreteActions: z.array(z.string()),
  rating: z.number().min(1).max(10),
});

export const sellerAnalysisOutput = z.object({
  sellers: z.array(sellerInsight),
  generalObservations: z.string(),
});

export type SellerAnalysisOutput = z.infer<typeof sellerAnalysisOutput>;
