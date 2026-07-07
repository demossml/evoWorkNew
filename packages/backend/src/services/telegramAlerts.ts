/**
 * Минимальный Telegram-клиент для алертов.
 * Отправляет сообщения через Telegram Bot API.
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

async function sendMessage(config: TelegramConfig, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

/**
 * Формирует и отправляет алерт по критическим продавцам.
 * Вызывается из крона / startup после расчёта seller-effectiveness.
 */
export async function sendCriticalAlerts(
  config: TelegramConfig,
  criticalSellers: Array<{
    name: string;
    daysBelow: number;
    planCompletion: number | null;
    trendSlope: number;
    store: string;
  }>,
): Promise<void> {
  if (!criticalSellers.length) return;

  const lines = criticalSellers.map((s) => {
    const planStr = s.planCompletion !== null ? `${s.planCompletion}%` : "нет плана";
    const trend = s.trendSlope > 0 ? `+${Math.round(s.trendSlope)}` : `${Math.round(s.trendSlope)}`;
    return `• <b>${s.name}</b> (${s.store}) — план ${planStr}, тренд ${trend} ₽/день, ${s.daysBelow} дн. подряд ниже 60%`;
  });

  const text = [
    `<b>🚨 Критические продавцы</b>`,
    ``,
    ...lines,
    ``,
    `<i>Требуется срочный разговор и пересмотр графика.</i>`,
  ].join("\n");

  await sendMessage(config, text);
}
