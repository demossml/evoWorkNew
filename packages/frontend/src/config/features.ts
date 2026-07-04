function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export const FEATURE_ANALYTICS_DASHBOARD_READONLY = parseBooleanFlag(
  import.meta.env.VITE_FEATURE_ANALYTICS_DASHBOARD_READONLY
);
