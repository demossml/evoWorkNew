import { client } from "@shared/api";

export type HourlyPlanFactRow = {
  hour: number;
  label: string;
  actualHourly: number;
  actualCumulative: number;
  accessoriesHourly?: number;
  accessoriesCumulative?: number;
  expectedCumulative: number;
  gap: number;
};

export type HourlyPlanFactResponse = {
  rows?: HourlyPlanFactRow[];
  totalPlan?: number;
  actualNet?: number;
  window?: {
    openHour?: number;
    closeHour?: number;
  };
  error?: string;
};

export type RefundDocument = {
  shopName: string;
  documentNumber: number;
  closeDate: string;
  employeeName: string;
  refundTotal: number;
  paymentBreakdown: Record<string, number>;
  items: Array<{ productName: string; quantity: number; sum: number }>;
};

export async function fetchRevenueHourlyPlanFact(params: {
  date: string;
  shopName?: string;
}) {
  const response = await client.api.analytics.revenue["hourly-plan-fact"].$get({
    query: {
      date: params.date,
      shopName: params.shopName,
    },
  });

  const json = (await response.json()) as HourlyPlanFactResponse;
  if (!response.ok) {
    throw new Error(json.error || "Не удалось загрузить план-факт по часам");
  }

  return json;
}

export async function fetchRevenueRefundDocuments(params: {
  since: string;
  until: string;
  limit?: string;
}) {
  const response = await client.api.analytics.revenue["refund-documents"].$get({
    query: {
      since: params.since,
      until: params.until,
      limit: params.limit || "120",
    },
  });

  const json = (await response.json()) as {
    documents?: RefundDocument[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(json.error || "Не удалось загрузить возвраты");
  }

  return json;
}
