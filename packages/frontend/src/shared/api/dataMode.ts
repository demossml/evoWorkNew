import { z } from "zod";

export const DataModeSchema = z.enum(["DB", "ELVATOR"]);

export type DataMode = z.infer<typeof DataModeSchema>;

export type DataModeMeta = {
	source: DataMode;
	aiAvailable: boolean;
};

export const DataModeMetaSchema = z.object({
	source: DataModeSchema,
	aiAvailable: z.boolean(),
});
