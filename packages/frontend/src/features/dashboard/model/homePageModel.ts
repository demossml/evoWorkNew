export type HomeRole = "CASHIER" | "ADMIN" | "SUPERADMIN" | "null" | string;

/**
 * Видит ли роль прибыль/маржу/валовую прибыль (GP).
 * SUPERADMIN и ADMIN — да; CASHIER и unknown — нет.
 */
export function canSeeProfit(role: string | undefined | null): boolean {
  return role === "SUPERADMIN" || role === "ADMIN";
}

export function buildHomeAccessModel(employeeRole?: HomeRole | null) {
  const role = employeeRole ?? null;
  const hasNoAccess = !role || role === "null";
  const isCashier = role === "CASHIER";
  const isAdmin = role === "ADMIN";
  const isSuperAdmin = role === "SUPERADMIN";
  const canSeeMainDashboard = isSuperAdmin || isAdmin || isCashier;

  return {
    hasNoAccess,
    isCashier,
    isAdmin,
    isSuperAdmin,
    canSeeMainDashboard,
  };
}
