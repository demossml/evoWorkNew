import { useQuery } from "@tanstack/react-query";
import { fetchCurrentWorkShop } from "@shared/api";
import type { CurrentWorkShopResponse } from "@/shared/api/contracts/currentWorkShop";

// Тип ответа от API
/**
 * Хук для получения информации о магазине, в котором сотрудник работает сегодня.
 * API берет Telegram user ID и сравнивает с фамилией сотрудника, открывшего смену,
 * затем возвращает UUID и name магазина.
 */
export const useCurrentWorkShop = () =>
  useQuery<CurrentWorkShopResponse, Error>({
    queryKey: ["currentWorkShop"],
    queryFn: fetchCurrentWorkShop,
    retry: 2,
    staleTime: 5 * 60 * 1000, // данные считаются свежими 5 минут
    refetchOnWindowFocus: true,
  });
