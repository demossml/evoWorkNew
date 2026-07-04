import { useQuery } from "@tanstack/react-query";
import {
  fetchEmployeeNameAndUuid,
  fetchEmployeeRole,
  fetchMe,
  fetchSchedules,
  fetchShops,
  fetchWorkingByShops,
  queryKeys,
} from "@shared/api";

export const useMe = () =>
  useQuery({
    queryKey: queryKeys.employee.me(),
    queryFn: fetchMe,
  });

export const useEmployeeRole = () =>
  useQuery({
    queryKey: queryKeys.employee.role(),
    queryFn: fetchEmployeeRole,
  });

export const useEmployeeNameAndUuid = () =>
  useQuery({
    queryKey: queryKeys.employee.uuidAndName(),
    queryFn: fetchEmployeeNameAndUuid,
  });

export const useSchedules = () =>
  useQuery({
    queryKey: queryKeys.schedules.all(),
    queryFn: fetchSchedules,
  });

export const useWorkingByShops = () =>
  useQuery({
    queryKey: queryKeys.evotor.workingByShops(),
    queryFn: fetchWorkingByShops,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

type ShopBrief = { uuid: string; name: string };

export const useGetShops = () =>
  useQuery<{ shopsNameAndUuid: ShopBrief[] }, Error>({
    queryKey: queryKeys.stores.shops(),
    queryFn: fetchShops,
  });

// export const useGetShopNames = () =>
//   useQuery<string[], Error>({
//     queryKey: ["getShopNames"],
//     queryFn: async () => {
//       const res = await client.api.evotor["shops-names"].$get();
//       if (!res.ok) {
//         throw new Error("Ошибка загрузки названий магазинов");
//       }
//       const data = await res.json();
//       return data.shopsName || [];
//     },
//     select: (data) => data || [], // на всякий случай
//   });
