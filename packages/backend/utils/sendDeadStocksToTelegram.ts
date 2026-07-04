// sendDeadStocksToTelegram.ts

import type { Evotor } from "../src/evotor";
import { formatDeadStocksMessage } from "./formatDeadStocksMessage";
import type { DeadStockItem } from "./formatDeadStocksMessage";
import { sendTelegramMessage } from "./sendTelegramMessage";

export async function sendDeadStocksToTelegram(
	params: {
		chatId: number | string;
		shopUuid: string;
		items: DeadStockItem[];
	},
	TELEGRAM_BOT_TOKEN: string,
	evotor: Evotor,
): Promise<unknown> {
	const text = await formatDeadStocksMessage(
		evotor,
		params.shopUuid,
		params.items,
	);

	return sendTelegramMessage(params.chatId, text, TELEGRAM_BOT_TOKEN);
}
