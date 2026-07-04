const DEEPSEEK_BASE = "https://api.deepseek.com/v1";

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
