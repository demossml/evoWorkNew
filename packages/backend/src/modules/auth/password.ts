/**
 * password.ts — хеширование паролей для Cloudflare Workers (Web Crypto API).
 * PBKDF2-SHA-256, 100000 итераций, случайная 16-байтовая соль.
 * Формат хранения: pbkdf2$<iterations>$<salt_b64>$<hash_b64>
 */

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function b64encode(buf: ArrayBuffer | Uint8Array): string {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let s = "";
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
	return btoa(s);
}

function b64decode(s: string): Uint8Array {
	const bin = atob(s);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export async function hashPassword(
	password: string,
	secret: string,
): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const enc = new TextEncoder();
	// Подмешиваем secret (pepper) к паролю
	const material = await crypto.subtle.importKey(
		"raw",
		enc.encode(password + secret),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
		material,
		KEY_BYTES * 8,
	);
	return `pbkdf2$${ITERATIONS}$${b64encode(salt)}$${b64encode(bits)}`;
}

export async function verifyPassword(
	password: string,
	stored: string,
	secret: string,
): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
	const iterations = Number(parts[1]);
	const salt = b64decode(parts[2]!);
	const expected = b64decode(parts[3]!);
	const enc = new TextEncoder();
	const material = await crypto.subtle.importKey(
		"raw",
		enc.encode(password + secret),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations, hash: "SHA-256" },
		material,
		expected.length * 8,
	);
	const actual = new Uint8Array(bits);
	if (actual.length !== expected.length) return false;
	// constant-time compare
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
	return diff === 0;
}

/** Генерация логина: prefix + 6 символов [a-z0-9] (без похожих букв/цифр) */
export function generateLogin(prefix = "seller"): string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // без 0/o/1/l/i
	let suffix = "";
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	for (let i = 0; i < 6; i++) suffix += alphabet[bytes[i]! % alphabet.length];
	return `${prefix}_${suffix}`;
}

/** Генерация пароля: 12 символов, читаемый алфавит */
export function generatePassword(length = 12): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = "";
	for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
	return out;
}

export function newId(): string {
	return crypto.randomUUID();
}
