/**
 * Парсер загрузки себестоимости.
 *
 * Поддерживаемые форматы:
 * 1. Отчёт 1С «Оценка склада» (TXT, TAB-разделители)
 *    — автоопределение по заголовку "Оценка склада"
 *    — колонки: Номенклатура / ... / Себестоимость
 *    — пропускает строки групп магазинов и итогов
 *    — вырезает единицу измерения из названия (", шт", ", кг" и т.д.)
 *
 * 2. Простой CSV (разделители: запятая, точка с запятой, табуляция)
 *    — две колонки: название товара, себестоимость
 *    — автоопределение колонок по заголовкам
 */

export interface CostPriceRow {
	productName: string;
	costPrice: number;
}

export interface ParseResult {
	rows: CostPriceRow[];
	errors: string[];
	meta: {
		totalRows: number;
		parsedRows: number;
		skippedRows: number;
		columnsFound: string[];
	};
}

/** Единицы измерения, которые вырезаются из названия товара */
const UNIT_SUFFIXES = [
	", шт", ", кг", ", г", ", л", ", мл", ", уп", ", пар", ", компл",
	", м", ", см", ", мм", ", кв.м", ", куб.м", ", час", ", сут",
	", мес", ", нед", ", год",
];

/**
 * Главная точка входа. Определяет формат и вызывает нужный парсер.
 */
export function parseCostPriceFile(content: string): ParseResult {
	// Определяем: это отчёт 1С или простой CSV?
	if (is1CReport(content)) {
		return parse1CReport(content);
	}
	return parseSimpleCSV(content);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1С «Оценка склада»
// ═══════════════════════════════════════════════════════════════════════════

/** Проверяет, является ли содержимое отчётом 1С «Оценка склада» */
function is1CReport(content: string): boolean {
	const head = content.slice(0, 1000);
	return head.includes("Оценка склада") || head.includes("Вид цены:");
}

/**
 * Парсит отчёт 1С «Оценка склада».
 *
 * Колонки отчёта (TAB-разделители):
 *   [0] Склад, Магазин / Номенклатура, Ед. изм.
 *   [1] Остаток на складе
 *   [2] Цена по виду цены        ← per-unit cost (приоритет)
 *   [3] Розничная цена
 *   [4] Себестоимость            ← total cost = остаток × цена за единицу
 *
 * ВАЖНО: «Себестоимость» в отчёте 1С — это ОБЩАЯ сумма (остаток × цена),
 * а не цена за единицу! Поэтому приоритет — колонка «Цена по виду цены».
 * Если она пуста — вычисляем per-unit = себестоимость / остаток.
 */
function parse1CReport(content: string): ParseResult {
	const errors: string[] = [];
	const lines = content.split(/\r?\n/);

	// Нормализуем неразрывные пробелы (\u00A0) в обычные
	const normalized = lines.map((l) => l.replace(/\u00A0/g, " "));

	// Ищем строку-заголовок колонок: содержит "Склад, Магазин" и "Себестоимость"
	let headerIdx = -1;
	for (let i = 0; i < normalized.length; i++) {
		const l = normalized[i];
		if (l.includes("Склад, Магазин") && l.includes("Себестоимость")) {
			headerIdx = i;
			break;
		}
	}

	if (headerIdx === -1) {
		return {
			rows: [],
			errors: ["Не удалось найти заголовок колонок в отчёте 1С (ожидаются «Склад, Магазин» и «Себестоимость»)"],
			meta: { totalRows: 0, parsedRows: 0, skippedRows: 0, columnsFound: [] },
		};
	}

	// Определяем индексы нужных колонок
	const headerCols = normalized[headerIdx].split("\t");
	let qtyColIdx = -1;      // Остаток на складе
	let priceColIdx = -1;    // Цена по виду цены (per-unit, приоритет)
	let totalCostColIdx = -1; // Себестоимость (total, fallback)

	for (let i = 0; i < headerCols.length; i++) {
		const h = headerCols[i].toLowerCase().trim();
		if (h.includes("остаток")) {
			qtyColIdx = i;
		} else if (h.includes("цена по виду")) {
			priceColIdx = i;
		} else if (h.includes("себестоимость")) {
			totalCostColIdx = i;
		}
	}

	if (priceColIdx === -1 && totalCostColIdx === -1) {
		return {
			rows: [],
			errors: ["Не удалось найти колонку с ценой (ожидаются «Цена по виду цены» или «Себестоимость»)"],
			meta: { totalRows: 0, parsedRows: 0, skippedRows: 0, columnsFound: headerCols },
		};
	}

	const rows: CostPriceRow[] = [];
	let skippedRows = 0;
	let dataRows = 0;

	for (let i = headerIdx + 1; i < normalized.length; i++) {
		const line = normalized[i].trim();
		if (line.length === 0) continue;

		const cols = line.split("\t");

		// Пропускаем строки с менее чем 2 колонками
		if (cols.length < 2) continue;

		const firstCol = cols[0].trim();

		// Пропускаем итоговую строку
		if (firstCol === "Итого" || firstCol.startsWith("Итого")) continue;

		// Пропускаем строки групп магазинов: содержат "(торговый зал)" или "(Торговый зал)"
		if (/\([тТ]орговый зал\)/.test(firstCol)) continue;

		// Пропускаем строки без названия товара
		if (!firstCol) continue;

		dataRows++;

		// Вырезаем единицу измерения из названия
		let productName = firstCol;
		for (const suffix of UNIT_SUFFIXES) {
			if (productName.endsWith(suffix)) {
				productName = productName.slice(0, -suffix.length).trim();
				break;
			}
		}

		// Определяем per-unit cost price
		let perUnitCost: number | null = null;

		// Приоритет 1: «Цена по виду цены» — это уже цена за единицу
		if (priceColIdx !== -1) {
			const rawPrice = (cols[priceColIdx] ?? "").trim();
			if (rawPrice && rawPrice !== "%") {
				const parsed = parsePrice(rawPrice);
				if (!Number.isNaN(parsed) && parsed >= 0) {
					perUnitCost = parsed;
				}
			}
		}

		// Приоритет 2: если нет per-unit цены, вычисляем из общей себестоимости
		if (perUnitCost === null && totalCostColIdx !== -1 && qtyColIdx !== -1) {
			const rawTotalCost = (cols[totalCostColIdx] ?? "").trim();
			const rawQty = (cols[qtyColIdx] ?? "").trim();
			if (rawTotalCost && rawTotalCost !== "%" && rawQty) {
				const totalCost = parsePrice(rawTotalCost);
				const qty = parsePrice(rawQty);
				if (!Number.isNaN(totalCost) && !Number.isNaN(qty) && qty > 0) {
					perUnitCost = totalCost / qty;
				}
			}
		}

		if (perUnitCost === null) {
			skippedRows++;
			continue;
		}

		rows.push({
			productName,
			costPrice: Math.round(perUnitCost * 100) / 100,
		});
	}

	return {
		rows,
		errors,
		meta: {
			totalRows: dataRows,
			parsedRows: rows.length,
			skippedRows,
			columnsFound: [
				"Номенклатура",
				priceColIdx !== -1 ? headerCols[priceColIdx]?.trim() ?? "Цена" : "Себестоимость / Остаток",
			],
		},
	};
}

// ═══════════════════════════════════════════════════════════════════════════
// Простой CSV (две колонки)
// ═══════════════════════════════════════════════════════════════════════════

function parseSimpleCSV(content: string): ParseResult {
	const errors: string[] = [];
	const lines = content
		.replace(/\u00A0/g, " ")
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	if (lines.length === 0) {
		return {
			rows: [],
			errors: ["Файл пуст"],
			meta: { totalRows: 0, parsedRows: 0, skippedRows: 0, columnsFound: [] },
		};
	}

	// Определяем разделитель по первой строке
	const sep = detectSeparator(lines[0]);

	// Парсим заголовок
	const headers = parseLine(lines[0], sep);
	const nameIdx = findColumnIndex(headers, [
		"название", "товар", "наименование", "name", "product", "товар/услуга",
		"номенклатура", "артикул",
	]);
	const costIdx = findColumnIndex(headers, [
		"себестоимость", "цена", "cost", "price", "закуп", "закупочная",
		"себестоимость ед.", "цена закуп.", "цена закупки",
	]);

	if (nameIdx === -1 || costIdx === -1) {
		return {
			rows: [],
			errors: [
				`Не удалось найти колонки. Найдены: ${headers.join(", ")}. ` +
				`Ожидаются: название товара и себестоимость.`,
			],
			meta: {
				totalRows: lines.length - 1,
				parsedRows: 0,
				skippedRows: lines.length - 1,
				columnsFound: headers,
			},
		};
	}

	const rows: CostPriceRow[] = [];
	let skippedRows = 0;

	for (let i = 1; i < lines.length; i++) {
		const cols = parseLine(lines[i], sep);
		const rawName = cols[nameIdx]?.trim() ?? "";
		const rawCost = cols[costIdx]?.trim() ?? "";

		if (!rawName) {
			skippedRows++;
			continue;
		}

		// Вырезаем единицу измерения из названия
		let productName = rawName;
		for (const suffix of UNIT_SUFFIXES) {
			if (productName.endsWith(suffix)) {
				productName = productName.slice(0, -suffix.length).trim();
				break;
			}
		}

		const cost = parsePrice(rawCost);
		if (Number.isNaN(cost) || cost < 0) {
			errors.push(`Строка ${i + 1}: некорректная цена "${rawCost}" для "${productName}"`);
			skippedRows++;
			continue;
		}

		rows.push({ productName, costPrice: Math.round(cost * 100) / 100 });
	}

	return {
		rows,
		errors,
		meta: {
			totalRows: lines.length - 1,
			parsedRows: rows.length,
			skippedRows,
			columnsFound: [headers[nameIdx], headers[costIdx]],
		},
	};
}

/**
 * Определяет разделитель CSV по строке.
 */
function detectSeparator(line: string): string {
	const semicolons = (line.match(/;/g) || []).length;
	const commas = (line.match(/,/g) || []).length;
	const tabs = (line.match(/\t/g) || []).length;

	if (tabs > semicolons && tabs > commas) return "\t";
	if (semicolons >= commas) return ";";
	return ",";
}

/**
 * Разбивает строку CSV на колонки с учётом кавычек.
 */
function parseLine(line: string, sep: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			inQuotes = !inQuotes;
		} else if (ch === sep && !inQuotes) {
			result.push(current.trim());
			current = "";
		} else {
			current += ch;
		}
	}
	result.push(current.trim());
	return result;
}

/**
 * Парсит цену из строки с учётом российских и международных форматов.
 *
 * Форматы:
 *   "1500,50"  → 1500.50  (запятая — десятичный разделитель)
 *   "1.500,50" → 1500.50  (точка — тысячи, запятая — десятичный)
 *   "35.00"    → 35.00    (точка — десятичный, если нет запятой и 1-2 цифры после)
 *   "1500"     → 1500     (целое)
 *   "1 500,50" → 1500.50  (пробел — тысячи)
 */
function parsePrice(raw: string): number {
	const s = raw.trim();
	if (s.length === 0) return NaN;

	// Если есть запятая — это десятичный разделитель (российский формат)
	if (s.includes(",")) {
		// Убираем пробелы и точки (разделители тысяч)
		const clean = s.replace(/[\s.]/g, "").replace(",", ".");
		return Number.parseFloat(clean);
	}

	// Если запятой нет, но есть точка:
	if (s.includes(".")) {
		const lastDotIdx = s.lastIndexOf(".");
		const afterDot = s.slice(lastDotIdx + 1);
		// Если после точки 1-2 цифры — это десятичный разделитель
		if (afterDot.length <= 2 && /^\d+$/.test(afterDot)) {
			// Убираем пробелы и possible тысячи (другие точки уже не могут быть — lastIndexOf)
			const clean = s.replace(/\s/g, "");
			return Number.parseFloat(clean);
		}
		// Иначе точка — разделитель тысяч (например "1.500" = 1500)
		const clean = s.replace(/[\s.]/g, "");
		return Number.parseFloat(clean);
	}

	// Просто целое число
	return Number.parseFloat(s.replace(/\s/g, ""));
}

/**
 * Находит индекс колонки по списку возможных названий.
 * Ищет частичное совпадение (без учёта регистра).
 */
function findColumnIndex(headers: string[], candidates: string[]): number {
	const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
	for (const candidate of candidates) {
		const idx = lowerHeaders.findIndex((h) => h.includes(candidate.toLowerCase()));
		if (idx !== -1) return idx;
	}
	// Если не нашли — пробуем искать по первому слову
	for (let i = 0; i < lowerHeaders.length; i++) {
		const firstWord = lowerHeaders[i].split(/\s+/)[0];
		for (const candidate of candidates) {
			if (firstWord.includes(candidate.toLowerCase())) return i;
		}
	}
	return -1;
}
