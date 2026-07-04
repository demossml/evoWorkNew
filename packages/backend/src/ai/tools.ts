import type { ZodSchema } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import type { IContext } from "../types";
import { assert } from "../utils";

type AiTextGenerationToolInput = {
	type: "function" | (string & NonNullable<unknown>);
	function: {
		name: string;
		description: string;
		parameters?: {
			type: "object" | (string & NonNullable<unknown>);
			properties: {
				[key: string]: {
					type: string;
					description?: string;
				};
			};
			required: string[];
		};
	};
};

export type ITool<T = unknown, U = unknown> = {
	schema: AiTextGenerationToolInput;
	input: ZodSchema<T>;
	output: ZodSchema<U>;
	invoke: (c: IContext, params: T) => Promise<U>;
};

export const tools = new Map<string, ITool>();

export const createTool = <T, U>(params: {
	name: string;
	description: string;
	input: ZodSchema<T>;
	output: ZodSchema<U>;
	invoke: (c: IContext, input: T) => Promise<U>;
}) => {
	assert(!tools.has(params.name), "already registered");

	const parameters = zodToJsonSchema(
		params.input,
	) as AiTextGenerationToolInput["function"]["parameters"];

	const outputSchema = JSON.stringify(zodToJsonSchema(params.output));

	tools.set(params.name, {
		schema: {
			type: "function",
			function: {
				name: params.name,
				description: `${params.description}.\nOutput Schema: ${outputSchema}`,
				parameters,
			},
		},
		input: params.input,
		output: params.output,
		invoke: params.invoke as (c: IContext, params: unknown) => Promise<unknown>,
	});

	return tools.get(params.name) as ITool;
};
