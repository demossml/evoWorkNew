import { client } from "@shared/api";

export async function fetchDashboardSummaryInsights(payload: unknown) {
  const response = await client.api.ai["dashboard-summary2-insights"].$post({
    json: payload,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      json && typeof json === "object" && "error" in json
        ? String((json as { error?: unknown }).error || "Ошибка Cloudflare AI")
        : "Ошибка Cloudflare AI",
    );
  }

  return json;
}

export async function fetchDashboardHomeInsights(payload: {
  since: string;
  until: string;
  dateMode: "today" | "yesterday" | "period";
  shopUuid?: string;
}) {
  const response = await (client.api.evotor as any)["dashboard-home-insights"].$post({
    json: payload,
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      (json as { error?: string; message?: string } | null)?.error ||
        (json as { error?: string; message?: string } | null)?.message ||
        "Не удалось загрузить инсайты",
    );
  }

  return json;
}

export async function fetchAccessoriesSales(params: {
  role: string;
  userId: string;
  since?: string;
  until?: string;
}) {
  const response = await (client.api.evotor.accessoriesSales[":role"][":userId"] as any).$post({
    param: {
      role: params.role,
      userId: params.userId,
    },
    json: params.since && params.until ? { since: params.since, until: params.until } : {},
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    const apiError = err as { error?: string; message?: string } | null;
    throw new Error(apiError?.error || apiError?.message || "Ошибка загрузки аксессуаров");
  }

  return response.json();
}
