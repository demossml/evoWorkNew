import type { D1Database } from "@cloudflare/workers-types";

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";

/**
 * Баланс DeepSeek: GET https://api.deepseek.com/user/balance
 * 401/403 → invalid_key; сеть/таймаут → network.
 */
export async function deepseekGetBalance(
	apiKey: string,
): Promise<{
	ok: boolean;
	is_available?: boolean;
	balances?: {
		currency: string;
		total_balance: string;
		granted_balance?: string;
		topped_up_balance?: string;
	}[];
	error?: string;
	status?: number;
}> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 10_000);
	try {
		const res = await fetch("https://api.deepseek.com/user/balance", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Accept: "application/json",
			},
			signal: controller.signal,
		});
		clearTimeout(timer);
		if (res.status === 401 || res.status === 403) {
			return { ok: false, error: "invalid_key", status: res.status };
		}
		if (!res.ok) {
			return { ok: false, error: `http_${res.status}`, status: res.status };
		}
		const data = (await res.json()) as {
			is_available?: boolean;
			balance_infos?: {
				currency: string;
				total_balance: string;
				granted_balance?: string;
				topped_up_balance?: string;
			}[];
		};
		return {
			ok: true,
			is_available: data.is_available ?? true,
			balances: data.balance_infos ?? [],
		};
	} catch {
		return { ok: false, error: "network" };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Ключ DeepSeek для запроса: tenant.deepseek_api_key → env.DEEPSEEK_API_KEY → null.
 */
export async function resolveDeepseekKey(
	db: D1Database,
	tenantId: string | undefined,
	envKey: string | undefined,
): Promise<string | null> {
	try {
		if (tenantId) {
			const { getTenantById } = await import("../modules/auth/repo");
			const t = await getTenantById(db, tenantId);
			const tenantKey = (t as { deepseek_api_key?: string | null } | null)
				?.deepseek_api_key
				?.trim();
			if (tenantKey) return tenantKey;
		}
	} catch {
		/* нет таблицы/доступа — фолбэк на env */
	}
	return envKey?.trim() || null;
}

interface DeepSeekChatOptions {
	apiKey: string;
	system: string;
	user: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

export async function deepseekChat(opts: DeepSeekChatOptions): Promise<string> {
	const {
		apiKey,
		system,
		user,
		model = "deepseek-chat",
		maxTokens = 1024,
		temperature = 0.3,
	} = opts;

	const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
			max_tokens: maxTokens,
			temperature,
		}),
	});

	if (!res.ok) {
		const errBody = await res.text().catch(() => "");
		throw new Error(
			`DeepSeek API error ${res.status}: ${errBody.slice(0, 300)}`,
		);
	}

	const data = (await res.json()) as {
		choices: { message: { content: string } }[];
	};

	const text = data.choices?.[0]?.message?.content;
	if (!text) {
		throw new Error("DeepSeek returned empty response");
	}

	return text;
}

export function deepseekChatStream(
	opts: DeepSeekChatOptions,
): ReadableStream<Uint8Array> {
	// В будущем можно сделать streaming, пока только sync
	const encoder = new TextEncoder();
	let done = false;

	return new ReadableStream({
		async start(controller) {
			try {
				const text = await deepseekChat(opts);
				controller.enqueue(encoder.encode(text));
				done = true;
			} catch (err) {
				controller.error(err);
			} finally {
				if (done) controller.close();
			}
		},
	});
}
