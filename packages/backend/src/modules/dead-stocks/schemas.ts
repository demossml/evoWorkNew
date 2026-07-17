// modules/dead-stocks/schemas.ts — zod-схемы запросов

import { z } from "zod";

export const deadStockDataSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  shopIds: z.array(z.string()).nullable(),
  groups: z.array(z.string()).default([]),
});

export const deadStockAnalyzeQuery = z.object({
  itemId: z.string().min(1),
  shopId: z.string().min(1),
  fast: z.string().optional(),
});

export const deadStockUpdateSchema = z.object({
  shopUuid: z.string().min(1),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    sold: z.number(),
    lastSaleDate: z.string().nullable(),
  })),
});

export const deadStockAiAnalysisSchema = z.object({
  shopUuid: z.string().min(1),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
  })),
});

export const deadStockActionsSchema = z.object({
  actions: z.array(z.object({
    itemId: z.string(),
    shopId: z.string(),
    action: z.enum(["move", "writeoff", "promo", "keep"]),
    targetShops: z.array(z.object({
      shopId: z.string(),
      shopName: z.string(),
      qty: z.number(),
    })).optional(),
  })),
});

export const deadStockCacheQuery = z.object({
  daysWithoutSales: z.string().optional(),
  shopId: z.string().optional(),
  limit: z.string().optional(),
});

export type DeadStockDataInput = z.infer<typeof deadStockDataSchema>;
export type DeadStockAnalyzeQuery = z.infer<typeof deadStockAnalyzeQuery>;
