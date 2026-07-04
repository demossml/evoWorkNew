import { z } from "zod";
import { DataModeMetaSchema } from "../dataMode";

export const WorkingByShopEntrySchema = z
	.object({
		shopUuid: z.string().min(1),
		opened: z.boolean(),
		employeeUuid: z.string().min(1).nullable(),
		employeeName: z.string().min(1).nullable(),
	})
	.strict();

export const WorkingByShopsResponseSchema = z
	.object({
		byShop: z.record(WorkingByShopEntrySchema),
		meta: DataModeMetaSchema.optional(),
	})
	.strict();

export type WorkingByShopsResponse = z.infer<typeof WorkingByShopsResponseSchema>;
