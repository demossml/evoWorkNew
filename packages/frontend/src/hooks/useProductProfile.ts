import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@shared/api";

export type ProductProfile = "vape" | "universal";

type ProductProfileResponse = {
  product_profile?: string;
  label?: string;
};

/**
 * Режим приложения текущего tenant (vape | universal).
 * Один источник правды на фронте: queryKey ["product-profile"].
 */
export function useProductProfile() {
  const query = useQuery<ProductProfileResponse>({
    queryKey: ["product-profile"],
    queryFn: async () => {
      const res = await fetch("/api/tenant/product-profile", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const profile: ProductProfile =
    query.data?.product_profile === "universal" ? "universal" : "vape";

  return {
    profile,
    isUniversal: profile === "universal",
    isLoading: query.isLoading,
    error: query.error,
  };
}
