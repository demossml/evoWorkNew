// Функция для получения env-переменной с проверкой
export function getEnv(key: string): string {
	const value = process.env[key];
	if (value === undefined) {
		throw new Error(`Missing environment variable: ${key}`);
	}
	return value;
}
