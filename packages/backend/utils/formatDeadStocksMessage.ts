import type { Evotor } from "../src/evotor";

export interface DeadStockItem {
	name: string;
	quantity: number;
	sold: number;
	lastSaleDate: string | null;
	mark?: "keep" | "move" | "sellout" | "writeoff" | null;
	moveCount?: number;
	moveToStore?: string; // UUID магазина назначения
}

/* ===================== HELPERS ===================== */

const MARK_LABELS: Record<NonNullable<DeadStockItem["mark"]>, string> = {
	keep: "✅ Оставить",
	move: "🚚 Переместить",
	sellout: "🔥 Распродажа",
	writeoff: "🗑 Списание",
};

/**
 * Форматирует дату в DD.MM.YYYY, корректно обрабатывая:
 * - ISO 8601
 * - DD.MM.YYYY
 * - null или неверные форматы → "—"
 */
function formatDate(date: string | null): string {
	if (!date) return "—";

	// Пробуем ISO
	let d = new Date(date);
	if (!Number.isNaN(d.getTime())) {
		return d.toLocaleDateString("ru-RU");
	}

	// Пробуем DD.MM.YYYY
	const parts = date.split(".");
	if (parts.length === 3) {
		const [day, month, year] = parts.map(Number);
		d = new Date(year, month - 1, day);
		if (!Number.isNaN(d.getTime())) {
			return d.toLocaleDateString("ru-RU");
		}
	}

	// fallback
	return "—";
}

/* ===================== MAIN FORMATTER ===================== */

export async function formatDeadStocksMessage(
	evotor: Evotor,
	shopUuid: string,
	items: DeadStockItem[],
): Promise<string> {
	let shopName: string;

	try {
		shopName = await evotor.getShopName(shopUuid);
	} catch {
		shopName = "Неизвестный магазин";
	}

	const markedItems = items.filter(
		(item) => item.mark !== null && item.mark !== undefined,
	);

	const header = `
📦 <b>Dead Stocks</b>
🏬 Магазин: <b>${shopName}</b>

`.trimStart();

	if (markedItems.length === 0) {
		return `${header}ℹ️ Нет отмеченных товаров`;
	}

	const body = await Promise.all(
		markedItems.map(async (item, index) => {
			const status = item.mark ? MARK_LABELS[item.mark] : "—";

			let destinationShopName = "—";

			if (item.mark === "move" && item.moveToStore) {
				try {
					destinationShopName = await evotor.getShopName(item.moveToStore);
				} catch {
					destinationShopName = "Неизвестный магазин";
				}
			}

			let extraInfo = "";

			if (item.mark === "move") {
				extraInfo = `
📦 Количество: <b>${item.moveCount ?? "—"}</b>
🏪 Магазин назначения: <b>${destinationShopName}</b>`;
			}

			return `
<b>${index + 1}. ${item.name}</b>
Остаток: <b>${item.quantity}</b>
Продано: <b>${item.sold}</b>
Последняя продажа: <b>${formatDate(item.lastSaleDate)}</b>
Статус: <b>${status}</b>${extraInfo}
`.trim();
		}),
	);

	return `${header}${body.join("\n\n──────────────\n\n")}`;
}
