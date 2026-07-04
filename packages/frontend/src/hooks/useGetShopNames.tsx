import { useQuery } from "@tanstack/react-query";
import { fetchShopNames, queryKeys } from "@shared/api";

export const useGetShopNames = () =>
  useQuery<string[], Error>({
    queryKey: queryKeys.stores.shopNames(),
    queryFn: fetchShopNames,
    select: (data) => data || [],
    staleTime: 10 * 60_000,
    placeholderData: (previousData) => previousData,
  });
