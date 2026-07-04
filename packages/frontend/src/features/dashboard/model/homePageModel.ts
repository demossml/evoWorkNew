export type HomeRole = "CASHIER" | "ADMIN" | "SUPERADMIN" | "null" | string;

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
