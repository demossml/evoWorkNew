import { z } from "zod";
import { DataModeMetaSchema } from "../dataMode";

export const CurrentWorkShopResponseSchema = z
	.object({
		uuid: z.string(),
		name: z.string(),
		isWorkingToday: z.boolean(),
		meta: DataModeMetaSchema.optional(),
	})
	.strict();

export type CurrentWorkShopResponse = z.infer<
	typeof CurrentWorkShopResponseSchema
>;
