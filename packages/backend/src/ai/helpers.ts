import type { ZodSchema } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import type { IContext } from "../types";
import { type ITool, tools } from "./tools";

export type RoleScopedChatInput = {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	name?: string;
};

export type AiTextGenerationOutput = {
	response: string;
	tool_calls?: Array<{
		name: string;
		arguments: any;
	}>;
};

export type LocalAiModels = {
	c: unknown;
	// Добавьте другие модели, если используете
	[key: string]: unknown; // Allow additional keys dynamically
};
/**
 * Повторяет вызов функции fn до 5 раз при ошибке аутентификации AI.
 */
async function runWithRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			return await fn();
		} catch (e: any) {
			const msg = e?.message || e?.toString?.() || "";
			if (
				msg.includes("InferenceUpstreamError: 10000: Authentication error") &&
				attempt < retries
			) {
				console.warn(`AI auth error, retrying attempt ${attempt}...`);
				await new Promise((res) => setTimeout(res, 500 * attempt));
				continue;
			}
			throw e;
		}
	}
	throw new Error("Max retries reached for AI authentication error");
}

/**
 * Разбивает массив на чанки указанного размера.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
		arr.slice(i * size, i * size + size),
	);
}

// const DEFAULT_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct" as const;
// const DEFAULT_MODEL = "@cf/google/gemma-3-12b-it" as const;
const DEFAULT_MODEL = "deepseek-chat" as const;

export type AiModels = {
	[DEFAULT_MODEL]: unknown;
	// Добавьте другие модели, если используете
};

interface DeepSeekMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	name?: string;
	tool_call_id?: string;
	tool_calls?: {
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}[];
}

interface DeepSeekResponse {
	choices: {
		message: DeepSeekMessage;
		finish_reason: string;
	}[];
}

/**
 * Запускает AI через DeepSeek API с поддержкой инструментов (tools).
 */
export const runWithTools = async (
	c: IContext,
	params: {
		messages: RoleScopedChatInput[];
		model?: keyof AiModels;
		maxTokens?: number;
		temperature?: number;
		tools?: ITool[];
	},
): Promise<string | undefined> => {
	const apiKey = c.env.DEEPSEEK_API_KEY;
	if (!apiKey) {
		throw new Error("DEEPSEEK_API_KEY not configured");
	}

	const model = "deepseek-chat";
	const max_tokens = params.maxTokens || 10240;
	const temperature = params.temperature || 0.4;

	// Build messages in DeepSeek (OpenAI-compatible) format
	const apiMessages: DeepSeekMessage[] = params.messages.map((m) => ({
		role: m.role,
		content: m.content,
	}));

	// eslint-disable-next-line no-constant-condition
	for (let iteration = 0; iteration < 10; iteration++) {
		const body: Record<string, unknown> = {
			model,
			messages: apiMessages,
			max_tokens,
			temperature,
		};

		if (params.tools?.length) {
			body.tools = params.tools.map((t) => t.schema);
			body.tool_choice = "auto";
		}

		// Retry loop for transient errors
		let res: Response | undefined;
		for (let attempt = 1; attempt <= 5; attempt++) {
			res = await fetch("https://api.deepseek.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify(body),
			});

			if (res.ok) break;

			const errText = await res.text().catch(() => "");
			// Retry on rate limits or server errors
			if ((res.status === 429 || res.status >= 500) && attempt < 5) {
				console.warn(
					`DeepSeek API error ${res.status}, retrying attempt ${attempt}...`,
				);
				await new Promise((r) => setTimeout(r, 500 * attempt));
				continue;
			}
			throw new Error(
				`DeepSeek API error ${res.status}: ${errText.slice(0, 300)}`,
			);
		}

		if (!res?.ok) {
			throw new Error("DeepSeek API request failed after retries");
		}

		const data: DeepSeekResponse = (await res.json()) as DeepSeekResponse;
		const msg = data.choices?.[0]?.message;
		if (!msg) {
			throw new Error("DeepSeek returned empty response");
		}

		// If tool calls are present, execute them
		if (msg.tool_calls && msg.tool_calls.length > 0) {
			// Add assistant message with tool_calls
			apiMessages.push({
				role: "assistant",
				content: msg.content,
				tool_calls: msg.tool_calls,
			});

			for (const tc of msg.tool_calls) {
				const name = tc.function.name;
				let args: unknown;
				try {
					args = JSON.parse(tc.function.arguments);
				} catch {
					args = {};
				}

				const tool = tools.get(name);
				let result: unknown;
				if (tool) {
					try {
						const parsed = tool.input.parse(args);
						result = await tool.invoke(c, parsed);
					} catch (e) {
						console.error("Tool call error:", e);
						result = {
							error: e instanceof Error ? e.message : String(e),
						};
					}
				} else {
					result = { error: `Tool ${name} not found` };
				}

				apiMessages.push({
					role: "tool",
					tool_call_id: tc.id,
					content: JSON.stringify(result),
				});
			}

			// Continue loop to send tool results back
			continue;
		}

		// No tool calls — return the content
		const content = msg.content || "";
		console.log("RESPONSE:", content.slice(0, 200));
		return content;
	}

	throw new Error("Max tool-call iterations reached");
};

/**
 * Универсальный генератор AI-задач с валидацией входных и выходных данных.
 * Если входной массив слишком большой — разбивает его на чанки и агрегирует результат.
 */
export function createChunkedTask<T, U>(
	taskFn: (c: IContext, input: T[]) => Promise<U>,
	chunkSize = 1000,
	aggregateFn?: (results: U[]) => U,
) {
	return async (c: IContext, input: T[]): Promise<U> => {
		if (input.length <= chunkSize) {
			return taskFn(c, input);
		}
		const chunks = chunkArray(input, chunkSize);
		const results: U[] = [];
		for (const chunk of chunks) {
			results.push(await taskFn(c, chunk));
		}
		if (aggregateFn) {
			return aggregateFn(results);
		}
		// По умолчанию возвращаем массив результатов
		return results as unknown as U;
	};
}

// /**
//  * Универсальный генератор AI-задач с валидацией входных и выходных данных.
//  */
// export const createTask =
// 	<T, U>(params: {
// 		task: string;
// 		inputSchema: ZodSchema<T>;
// 		outputSchema: ZodSchema<U>;
// 		model?: keyof AiModels;
// 		maxTokens?: number;
// 		temperature?: number;
// 		tools?: ITool[];
// 	}) =>
// 	async (c: IContext, input: T): Promise<U> => {
// 		// Валидация входных данных
// 		try {
// 			params.inputSchema.parse(input);
// 		} catch (e: any) {
// 			console.error("Input validation error:", e.issues ?? e);
// 			throw new Error("Invalid input: " + JSON.stringify(e.issues ?? e));
// 		}

// 		const iSchema = JSON.stringify(zodToJsonSchema(params.inputSchema));
// 		const oSchema = JSON.stringify(zodToJsonSchema(params.outputSchema));

// 		let response = await runWithTools(c, {
// 			...params,
// 			messages: [
// 				{
// 					role: "system",
// 					content: `${params.task}.
//             Input Schema: ${iSchema}.
//             Output Schema: ${oSchema}.
//             Respond only with JSON, using output schema.`,
// 				},
// 				{
// 					role: "user",
// 					content: JSON.stringify(input),
// 				},
// 			],
// 		});

// 		if (!response) {
// 			throw new Error("Empty response from AI");
// 		}

// 		// Удаление обёртки ```json ... ```
// 		response = response.trim();
// 		if (response.startsWith("```json")) {
// 			response = response.slice(7).trim();
// 		}
// 		if (response.endsWith("```")) {
// 			response = response.slice(0, -3).trim();
// 		}

// 		try {
// 			const parsed = JSON.parse(response);
// 			return params.outputSchema.parse(parsed);
// 		} catch (e) {
// 			console.error("Response parsing or validation error:", e);
// 			throw new Error("Failed to parse or validate response: " + response);
// 		}
// 	};

function jsonToCsv<T extends object>(data: T[]): string {
	if (!data.length) return "";
	const keys = Object.keys(data[0]);
	const csvRows = [
		keys.join(","),
		...data.map((row) =>
			keys.map((k) => JSON.stringify((row as any)[k] ?? "")).join(","),
		),
	];
	return csvRows.join("\n");
}

export const createTask =
	<T, U>(params: {
		task: string;
		inputSchema: ZodSchema<T>;
		outputSchema: ZodSchema<U>;
		model?: keyof AiModels;
		maxTokens?: number;
		temperature?: number;
		tools?: ITool[];
		asCsv?: boolean;
	}) =>
	async (c: IContext, input: T): Promise<U> => {
		// Валидация входных данных
		try {
			params.inputSchema.parse(input);
		} catch (e: any) {
			console.error("Input validation error:", e.issues ?? e);
			throw new Error(`Invalid input: ${JSON.stringify(e.issues ?? e)}`);
		}

		const iSchema = JSON.stringify(zodToJsonSchema(params.inputSchema));
		const oSchema = JSON.stringify(zodToJsonSchema(params.outputSchema));

		let userContent: string;
		if (params.asCsv && Array.isArray(input)) {
			userContent = jsonToCsv(input);
		} else {
			userContent = JSON.stringify(input);
		}

		let response = await runWithTools(c, {
			...params,
			messages: [
				{
					role: "system",
					content: `${params.task}.
Input Schema: ${iSchema}.
Output Schema: ${oSchema}.
Respond only with JSON, using output schema.${params.asCsv ? " Входные данные предоставлены в формате CSV, первая строка — заголовки столбцов." : ""}`,
				},
				{
					role: "user",
					content: userContent,
				},
			],
		});

		if (!response) {
			throw new Error("Empty response from AI");
		}

		// Удаление обёртки ```json ... ```
		response = response.trim();
		if (response.startsWith("```json")) {
			response = response.slice(7).trim();
		}
		if (response.endsWith("```")) {
			response = response.slice(0, -3).trim();
		}

		try {
			const parsed = JSON.parse(response);
			return params.outputSchema.parse(parsed);
		} catch (e) {
			console.error("Response parsing or validation error:", e);
			throw new Error(`Failed to parse or validate response:  ${response}`);
		}
	};
