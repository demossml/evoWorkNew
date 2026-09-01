import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@shared/api";
import { useEmployeeRole } from "./useApi";
import {
  canAccessFeature,
  defaultFeaturePermissions,
  type RoleFeaturePermissions,
} from "@/config/featurePermissions";

/**
 * useFeaturePermissions — роль + права фич (tenant-scoped).
 * SUPERADMIN: can() всегда true.
 */
export function useFeaturePermissions() {
  const { data: roleData } = useEmployeeRole();
  const role = roleData?.employeeRole;

  const { data: perms } = useQuery<RoleFeaturePermissions>({
    queryKey: ["feature-permissions"],
    queryFn: async () => {
      const res = await fetch("/api/tenant/feature-permissions", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<RoleFeaturePermissions>;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const effective = perms ?? defaultFeaturePermissions();

  const can = (featureId: string): boolean =>
    canAccessFeature(role, featureId, effective);

  return { role, perms: effective, can };
}
