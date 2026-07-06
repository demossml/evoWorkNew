import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * Локальная реализация D1Database API на better-sqlite3.
 * Эмулирует все методы D1, используемые в проекте.
 */
export class LocalD1Database {
	#db: Database.Database;

	constructor(dbPath: string) {
		const dir = path.dirname(dbPath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		this.#db = new Database(path.resolve(dbPath));
		this.#db.pragma("journal_mode = WAL");
		this.#db.pragma("foreign_keys = ON");
	}

	prepare(query: string): LocalD1PreparedStatement {
		return new LocalD1PreparedStatement(this.#db, query);
	}

	/** Эмулирует D1 batch: массив D1PreparedStatement (наши LocalD1PreparedStatement) */
	batch(statements: LocalD1PreparedStatement[]): Array<{ results: unknown[] }> {
		const results: Array<{ results: unknown[] }> = [];
		const exec = this.#db.transaction(() => {
			for (const stmt of statements) {
				const result = stmt.execute();
				results.push(result);
			}
		});
		exec();
		return results;
	}

	exec(query: string): void {
		this.#db.exec(query);
	}

	close(): void {
		this.#db.close();
	}

	/** Возвращает нижележащий better-sqlite3 инстанс для drizzle-orm */
	get raw(): Database.Database {
		return this.#db;
	}
}

class LocalD1PreparedStatement {
	private _db: Database.Database;
	private _query: string;      // запрос с ? (для better-sqlite3)
	private _rawQuery: string;   // оригинальный запрос (с ?N)
	private _bound: unknown[] = [];
	private _paramIndices: number[] = []; // порядковые номера ?N в запросе (0-based from bind)
	private _totalPlaceholders = 0;       // общее количество ? в итоговом запросе

	constructor(db: Database.Database, query: string) {
		this._db = db;
		this._rawQuery = query;
		// D1 использует ?1, ?2 — better-sqlite3 требует ?.
		// Сохраняем индексы для нумерованных (?N) И считаем общее количество ?.
		const indices: number[] = [];
		let placeholderCount = 0;
		this._query = query.replace(/\?(\d*)/g, (_, n) => {
			placeholderCount++;
			if (n !== "") {
				indices.push(parseInt(n, 10) - 1); // 0-based
			} else {
				indices.push(-1); // безымянный — заполнится позиционно
			}
			return "?";
		});
		this._paramIndices = indices;
		this._totalPlaceholders = placeholderCount;
	}

	bind(...params: unknown[]): this {
		// D1: bind возвращает this, но с зафиксированными параметрами.
		// Создаём КЛОН с зафиксированными параметрами для поддержки batch.
		// Object.create + ручное копирование (не вызываем конструктор, чтобы не парсить ?N заново)
		const clone = Object.create(LocalD1PreparedStatement.prototype) as this;
		(clone as any)._db = this._db;
		(clone as any)._query = this._query;
		(clone as any)._rawQuery = this._rawQuery;
		(clone as any)._paramIndices = this._paramIndices;
		(clone as any)._totalPlaceholders = this._totalPlaceholders;

		if (this._paramIndices.length === 0) {
			(clone as any)._bound = [...params];
		} else if (params.length === this._totalPlaceholders) {
			(clone as any)._bound = [...params];
		} else {
			let nextPos = 0;
			(clone as any)._bound = this._paramIndices.map((i: number) => {
				if (i >= 0) return params[i];
				return params[nextPos++];
			});
		}
		return clone;
	}

	all<T = Record<string, unknown>>(): { success: boolean; results: T[] } {
		const stmt = this._db.prepare(this._query);
		const rows = stmt.all(...this._bound) as T[];
		return { success: true, results: rows };
	}

	first<T = Record<string, unknown>>(): T | null {
		const stmt = this._db.prepare(this._query);
		return (stmt.get(...this._bound) as T) ?? null;
	}

	run(): { success: boolean; meta?: { changes: number } } {
		const stmt = this._db.prepare(this._query);
		const info = stmt.run(...this._bound);
		return { success: true, meta: { changes: info.changes } };
	}

	/** Выполняет statement без возврата результата (для batch) */
	execute(): { results: unknown[] } {
		const stmt = this._db.prepare(this._query);
		stmt.run(...this._bound);
		return { results: [] };
	}

	raw<T = unknown[]>(): { results: T[] } {
		const stmt = this._db.prepare(this._query);
		const rows = stmt.raw().all(...this._bound) as T[];
		return { results: rows };
	}
}
