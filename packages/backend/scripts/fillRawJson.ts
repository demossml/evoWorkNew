/**
 * fillRawJson.ts — одноразовое дозаполнение raw_json для старых документов.
 *
 * Использование:
 *   cd packages/backend
 *   pnpm exec tsx scripts/fillRawJson.ts
 *
 * Для каждого (shop_id, день), где есть документы без raw_json,
 * заново запрашивает документы дня из Эвотор и обновляет raw_json.
 * Идемпотентный: повторный запуск ничего не делает.
 */

import { LocalD1Database } from "../src/adapters/local-db";
import { Evotor } from "../src/evotor";
import { formatDateWithTime } from "../src/utils";

const TOKEN = process.env.EVOTOR_API_TOKEN;
if (!TOKEN) {
	console.error("❌ EVOTOR_API_TOKEN не задан (экспортируйте или добавьте в .dev.vars)");
	process.exit(1);
}
const DB_PATH = process.env.DB_PATH ?? "./data/local.db";

async function main() {
	const db = new LocalD1Database(DB_PATH);
	const evo = new Evotor(TOKEN);

	const rows = await db
		.prepare(
			`
			SELECT DISTINCT shop_id, substr(close_date, 1, 10) as d
			FROM index_documents
			WHERE raw_json IS NULL OR raw_json = ''
		`,
		)
		.all<{ shop_id: string; d: string }>();

	const pairs = (rows.results ?? []).filter((r) => r.shop_id && r.d);
	console.log(
		`Нужно дозаполнить raw_json для ${pairs.length} пар (магазин, день)`,
	);

	let updated = 0;
	let failed = 0;

	for (const row of pairs) {
		try {
			const start = new Date(`${row.d}T00:00:00Z`);
			const end = new Date(`${row.d}T23:59:59Z`);
			const docs = await evo.getDocuments(
				row.shop_id,
				formatDateWithTime(start, false),
				formatDateWithTime(end, true),
			);

			const stmt = db.prepare(`
				UPDATE index_documents
				SET raw_json = ?1
				WHERE shop_id = ?2 AND number = ?3
				  AND (raw_json IS NULL OR raw_json = '')
			`);

			const batch = docs
				.filter((d) => d.storeUuid === row.shop_id && d.number !== undefined)
				.map((d) => stmt.bind(JSON.stringify(d), row.shop_id, String(d.number)));

			if (batch.length > 0) {
				await db.batch(batch);
				updated += batch.length;
			}
			process.stdout.write(
				`\r[${updated} обновлено] ${row.shop_id.slice(0, 8)} ${row.d} (+${docs.length} из API)`,
			);
		} catch (e: any) {
			failed++;
			console.error(`\nОшибка для ${row.shop_id} ${row.d}:`, e?.message);
		}

		// Щадим rate-limit Эвотор
		await new Promise((r) => setTimeout(r, 400));
	}

	console.log(`\nГотово. Обновлено: ${updated}, ошибок: ${failed}`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
