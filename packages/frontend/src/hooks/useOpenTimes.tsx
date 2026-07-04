import { useQuery } from "@tanstack/react-query";
import { fetchOpenTimes } from "@shared/api";

export const useOpenTimes = () =>
  useQuery<Record<string, string>, Error>({
    queryKey: ["getOpenTimes"],
    queryFn: fetchOpenTimes,
    select: (data) => data || {}, // возвращаем объект, а не массив
  });
