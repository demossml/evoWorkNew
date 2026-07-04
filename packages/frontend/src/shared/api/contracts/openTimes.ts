import { z } from "zod";

export const OpenTimesResponseSchema = z
	.object({
		dataReport: z.record(z.string()),
	})
	.strict();

export type OpenTimesResponse = z.infer<typeof OpenTimesResponseSchema>;
