import { client } from "@shared/api";

export async function uploadReportImage(file: File) {
  const response = await (client.api.uploads as any).upload.$post({
    form: {
      photos: file,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ошибка при загрузке: ${response.status}. ${errorText}`);
  }

  const result = (await response.json()) as
    | { url: string; name: string }
    | { code: string; message: string; details?: unknown };

  if (!("url" in result) || !result.url) {
    throw new Error("URL не найден в ответе сервера");
  }

  return result.url;
}
