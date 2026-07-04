/**
 * Отправляет фото в Telegram и возвращает file_id.
 * Фото хранится на серверах Telegram, мы храним только file_id.
 *
 * @param fileBuffer - бинарные данные файла (JPEG)
 * @param filename  - имя файла
 * @param chatId    - ID чата/канала, куда отправлять
 * @param botToken  - токен бота
 * @returns наибольший file_id из массива photo (максимальное разрешение)
 */
export async function sendPhotoToTelegram(
	fileBuffer: ArrayBuffer,
	filename: string,
	chatId: string,
	botToken: string,
): Promise<string> {
	const formData = new FormData();
	const blob = new Blob([fileBuffer], { type: "image/jpeg" });
	formData.append("chat_id", chatId);
	formData.append("photo", blob, filename);
	formData.append("disable_notification", "true");

	const response = await fetch(
		`https://api.telegram.org/bot${botToken}/sendPhoto`,
		{
			method: "POST",
			body: formData,
		},
	);

	const data = (await response.json()) as {
		ok: boolean;
		result?: { photo?: Array<{ file_id: string; file_size: number }> };
		description?: string;
	};

	if (!data.ok || !data.result?.photo?.length) {
		throw new Error(
			data.description || "Telegram sendPhoto failed",
		);
	}

	// Берём последнее фото — максимальное разрешение
	const largestPhoto = data.result.photo[data.result.photo.length - 1];
	return largestPhoto.file_id;
}
