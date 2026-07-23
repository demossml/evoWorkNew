import { useEffect, useState } from "react";
import { fetchAccessoriesSales } from "@features/dashboard/api";

interface AccessoriesSalesParams {
  role: string;
  userId: string;
  since?: string;
  until?: string;
  enabled?: boolean;
}

export interface AccessoriesSalesData {
  byShop: Array<{
    shopId: string;
    shopName: string;
    sales: Array<{
      name: string;
      quantity: number;
      sum: number;
      cost: number;
    }>;
  }>;
  total: Array<{
    name: string;
    shopName: string;
    quantity: number;
    sum: number;
    cost: number;
  }>;
  nonAccessoriesByShop: Array<{
    shopId: string;
    shopName: string;
    sales: Array<{
      name: string;
      quantity: number;
      sum: number;
      cost: number;
    }>;
  }>;
  nonAccessoriesTotal: Array<{
    name: string;
    shopName: string;
    quantity: number;
    sum: number;
    cost: number;
  }>;
  error?: string;
}

export function useAccessoriesSales(params: AccessoriesSalesParams) {
  const [data, setData] = useState<AccessoriesSalesData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.enabled === false) return;
    if (!params.role || !params.userId) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = (await fetchAccessoriesSales({
          role: params.role,
          userId: params.userId,
          since: params.since,
          until: params.until,
        })) as AccessoriesSalesData;
        if ("error" in result && result.error) {
          throw new Error(result.error);
        }
        setData(result);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Ошибка запроса");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [params.role, params.userId, params.since, params.until, params.enabled]);

  return { data, loading, error };
}
