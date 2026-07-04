import { useQuery } from "@tanstack/react-query";
import { fetchIsOpenStore } from "@features/opening/api";

interface IsOpenStoreResponse {
  exists: boolean;
  error?: string;
}

export const useIsOpenStore = (
  userId: string,
  date: string,
  shopUuid: string | null,
) =>
  useQuery<IsOpenStoreResponse>({
    queryKey: ["isOpenStore", userId, date, shopUuid],
    queryFn: () =>
      fetchIsOpenStore({
        userId,
        date,
        shopUuid: shopUuid ?? "",
      }),
    enabled: !!userId && !!date && !!shopUuid,
  });
