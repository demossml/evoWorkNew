import { client } from "@shared/api";

export async function generatePdfFromHtml(html: string) {
  const response = await client.api.evotor["generate-pdf"].$post({
    json: { html },
  });

  if (!response.ok) {
    throw new Error("Ошибка отправки.");
  }

  return response;
}

export async function generatePdfFromFile(file: File) {
  const response = await client.api.evotor["generate-pdf"].$post({
    form: {
      file,
    },
  });

  if (!response.ok) {
    throw new Error(`Ошибка сервера: ${response.status}`);
  }

  return response;
}

export async function fetchScheduleTable(payload: {
  month: number;
  year: number;
  shopId: string;
}) {
  const response = await client.api.schedules["table-view"].$post({
    json: payload,
  });

  if (!response.ok) {
    throw new Error("Ошибка при получении табеля");
  }

  return response.json();
}
