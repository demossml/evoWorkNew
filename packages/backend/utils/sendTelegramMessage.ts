export interface TelegramSendMessageResponse {
	ok: boolean;
	result?: unknown;
	description?: string;
}

export async function sendTelegramMessage(
	chatId: number | string,
	text: string,
	TELEGRAM_BOT_TOKEN: string,
) {
	try {
		const response = await fetch(
			`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					chat_id: chatId,
					text,
					parse_mode: "HTML",
					disable_web_page_preview: true,
				}),
			},
		);

		const data = (await response.json()) as TelegramSendMessageResponse;

		if (!data.ok) {
			throw new Error(
				data.description || "Не удалось отправить сообщение в Telegram",
			);
		}

		return data.result;
	} catch (error) {
		console.error("Ошибка при отправке сообщения в Telegram:", error);
		throw error;
	}
}
