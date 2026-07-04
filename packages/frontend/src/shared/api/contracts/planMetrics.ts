import { z } from "zod";
import { DataModeMetaSchema } from "../dataMode";

export const PlanQuantitySchema = z.record(z.number().finite());

export const PlanShopMetricsSchema = z
	.object({
		datePlan: z.number().finite(),
		dataSales: z.number().finite(),
		dataQuantity: PlanQuantitySchema.nullable(),
	})
	.strict();

export const PlanForTodayResponseSchema = z
	.object({
		salesData: z.record(PlanShopMetricsSchema.nullable()),
		meta: DataModeMetaSchema.optional(),
	})
	.strict();

export type PlanForTodayResponse = z.infer<typeof PlanForTodayResponseSchema>;
