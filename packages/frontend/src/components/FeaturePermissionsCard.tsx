import { useEffect, useState } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { useEmployeeRole } from "@/hooks/useApi";
import { getAuthHeaders } from "@shared/api";
import {
  FEATURE_CATALOG,
  defaultFeaturePermissions,
  type RoleFeaturePermissions,
} from "@/config/featurePermissions";

export function FeaturePermissionsCard() {
  const { data: roleData } = useEmployeeRole();
  const isSuperAdmin = roleData?.employeeRole === "SUPERADMIN";

  const [perms, setPerms] = useState<RoleFeaturePermissions>(defaultFeaturePermissions());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/tenant/feature-permissions", { headers: getAuthHeaders() });
        if (res.ok) {
          const data = (await res.json()) as RoleFeaturePermissions;
          if (!cancelled) setPerms(data);
        }
      } catch {
        /* defaults */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  const toggle = (role: "ADMIN" | "CASHIER", id: string) => {
    setPerms((prev) => {
      const list = prev[role];
      const has = list.includes(id);
      return {
        ...prev,
        [role]: has ? list.filter((x) => x !== id) : [...list, id],
      };
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/tenant/feature-permissions", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(perms),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const renderRows = (group: "home" | "report") => (
    <div className="space-y-2">
      {FEATURE_CATALOG.filter((f) => f.group === group).map((f) => {
        const cashierBlocked = Boolean(f.profit);
        return (
          <div key={f.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-b-0">
            <span className="text-sm text-foreground min-w-0 flex-1">{f.label}</span>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={perms.ADMIN.includes(f.id)}
                onChange={() => toggle("ADMIN", f.id)}
                className="accent-primary"
              />
              Админ
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                disabled={cashierBlocked}
                checked={perms.CASHIER.includes(f.id)}
                onChange={() => toggle("CASHIER", f.id)}
                className="accent-primary disabled:opacity-40"
              />
              Кассир
            </label>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl border-l-4 border-l-indigo-500 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <ShieldCheck className="w-5 h-5 text-indigo-400" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Права: отчёты и главный экран</h3>
          <p className="text-[10px] text-muted-foreground">
            Супер-админ видит всё всегда. Кассиру нельзя открыть прибыль.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="px-4 py-3 space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Главный экран
            </h4>
            {renderRows("home")}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Отчёты
            </h4>
            {renderRows("report")}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? "Сохранено" : (<><Save className="w-4 h-4" /> Сохранить</>)}
          </button>
        </div>
      )}
    </div>
  );
}
