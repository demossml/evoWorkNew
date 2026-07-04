import { client } from "@shared/api";

export type DeadStockItemPayload = {
  name: string;
  quantity: number;
  sold: number;
  lastSaleDate: string | null;
  mark?: "keep" | "move" | "sellout" | "writeoff" | null;
  moveCount?: number;
  moveToStore?: string;
};

export async function updateDeadStocks(payload: {
  items: DeadStockItemPayload[];
  shopUuid: string;
}) {
  const response = await client.api.deadStocks.update.$post({
    json: payload,
  });

  if (!response.ok) {
    throw new Error("Сеть ответила с ошибкой");
  }

  return response.json();
}
