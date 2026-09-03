import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@shared/api";

type MeResponse = { isPlatformOwner?: boolean };

/**
 * useIsPlatformOwner — является ли текущий пользователь владельцем платформы.
 * Источник истины — /api/auth/me (поле isPlatformOwner, считает backend).
 * Используется для скрытия платформенных настроек (например, «Режим приложения»).
 */
export function useIsPlatformOwner(): boolean {
  const { data } = useQuery({
    queryKey: ["auth-me", "isPlatformOwner"],
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        const res = await fetch("/api/auth/me", { headers: getAuthHeaders() });
        if (!res.ok) return null;
        return (await res.json()) as MeResponse;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });
  return Boolean(data?.isPlatformOwner);
}
