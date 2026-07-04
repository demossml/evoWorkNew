import { client } from "@shared/api";

export type OpenStorePayload = {
  timestamp: string;
  userId: string;
  shopUuid: string;
  date: string;
  userName?: string;
};

export type FinishOpeningPayload = {
  ok: boolean | null;
  discrepancy:
    | {
        amount: string | number;
        type: "+" | "-";
      }
    | null;
  userId: string;
  shopUuid: string;
};

export type ShopOpeningStatus = {
  uuid: string;
  name: string;
  isOpenedToday?: boolean;
  openedByUserId?: string | null;
  openedByName?: string | null;
  openedAt?: string | null;
  openedTime?: string | null;
  isLate?: boolean;
  canSelect?: boolean;
  blockedReason?: string | null;
};

export type PosSession = {
  shopUuid: string;
  shopName: string;
  openedAt: string;
  openedTime: string;
  openedByName: string;
  isLate: boolean;
};

export async function fetchPosSessions(): Promise<PosSession[]> {
  try {
    const response = await client.api.stores["pos-sessions"].$post({ json: {} });
    if (!response.ok) return [];
    const data = (await response.json()) as { sessions?: PosSession[] };
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

export async function fetchShopsOpeningStatus(date: string) {
  const response = await client.api.stores["shops-opening-status"].$post({
    json: { date },
  });

  if (!response.ok) {
    throw new Error(`Ошибка загрузки магазинов: ${response.status}`);
  }

  const data = (await response.json()) as { shopsNameAndUuid?: ShopOpeningStatus[] };
  return Array.isArray(data.shopsNameAndUuid) ? data.shopsNameAndUuid : [];
}

export async function openStore(payload: OpenStorePayload) {
  const response = await client.api.stores["open-store"].$post({
    json: payload,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      (errorBody as { error?: string } | null)?.error ??
        `Ошибка открытия магазина: ${response.status}`,
    );
  }
}

export async function finishOpening(payload: FinishOpeningPayload) {
  const response = await client.api.stores["finish-opening"].$post({
    json: payload,
  });

  if (!response.ok) {
    throw new Error(`Ошибка завершения открытия: ${response.status}`);
  }
}

export async function fetchIsOpenStore(params: {
  userId: string;
  date: string;
  shopUuid: string;
}) {
  const res = await client.api.stores["is-open-store"].$post({
    json: params,
  });

  if (!res.ok) {
    return { exists: false, error: "temporary_unavailable" };
  }

  return res.json() as Promise<{ exists: boolean; error?: string }>;
}
