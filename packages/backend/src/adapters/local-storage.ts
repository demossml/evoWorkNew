import fs from "fs";
import path from "path";

/**
 * Локальная реализация R2Bucket API на файловой системе.
 * Эмулирует put/get, используемые в проекте.
 */
export class LocalR2Bucket {
	#baseDir: string;

	constructor(baseDir: string) {
		this.#baseDir = path.resolve(baseDir);
		if (!fs.existsSync(this.#baseDir)) {
			fs.mkdirSync(this.#baseDir, { recursive: true });
		}
	}

	async put(
		key: string,
		value: ArrayBuffer | Uint8Array | ReadableStream,
		options?: { httpMetadata?: { contentType?: string } },
	): Promise<void> {
		const filePath = path.join(this.#baseDir, key);
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

		let buffer: Buffer;
		if (value instanceof ArrayBuffer) {
			buffer = Buffer.from(value);
		} else if (value instanceof Uint8Array) {
			buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
		} else {
			// ReadableStream — собираем чанки
			const reader = (value as ReadableStream).getReader();
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value: chunk } = await reader.read();
				if (done) break;
				chunks.push(chunk);
			}
			buffer = Buffer.concat(chunks);
		}

		fs.writeFileSync(filePath, buffer);

		// Сохраняем метаданные в отдельный .meta.json
		if (options?.httpMetadata) {
			fs.writeFileSync(
				filePath + ".meta.json",
				JSON.stringify(options.httpMetadata),
			);
		}
	}

	async get(
		key: string,
	): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null> {
		const filePath = path.join(this.#baseDir, key);
		if (!fs.existsSync(filePath)) return null;

		let httpMetadata: { contentType?: string } | undefined;
		const metaPath = filePath + ".meta.json";
		if (fs.existsSync(metaPath)) {
			httpMetadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
		}

		return {
			body: fs.createReadStream(filePath) as unknown as ReadableStream,
			httpMetadata,
		};
	}
}
