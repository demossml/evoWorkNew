import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, RefreshCw, AlertTriangle } from "lucide-react";

/**
 * SyncStatusWidget — плитка-статусбар универсального движка синхронизации.
 * Только для разработки/отладки: показывает живую картину синхронизации
 * (sync_state, тенанты, документы) и обновляется каждые 5 секунд.
 *
 * Отключение:
 *  1) Настройка в БД: sync_status_tile_enabled = 0 (проверяется на бэкенде —
 *     тогда tileEnabled=false и виджет не рендерится);
 *  2) Плитка показывается только администраторам (isSuperAdmin на Home).
 */

interface SyncStateRow {
  tenant_id: string;
  store_id: string;
  resource: string;
  last_success_at: string | null;
  last_close_date: string | null;
  status: string | null;
  error: string | null;
  updated_at: string | null;
}

interface SyncStatusResponse {
  tileEnabled: boolean;
  tenants: { id: string; name: string; status: string }[];
  states: SyncStateRow[];
  docs: { total: number; byType: { type: string; n: number }[] };
  counts: { shops: number; employees: number; devices: number };
  initError?: string;
}

const RESOURCE_LABELS: Record<string, string> = {
  shops: "Магазины",
  employees: "Сотрудники",
  devices: "Терминалы",
  products: "Товары",
  stock: "Остатки",
  documents: "Документы",
};

const RESOURCE_ORDER = ["documents", "stock", "products", "shops", "employees", "devices"];

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso.includes(" ") ? `${iso.replace(" ", "T")}Z` : iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec} сек назад`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин назад`;
  return `${Math.round(sec / 3600)} ч назад`;
}

function parseIso(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso.includes(" ") ? `${iso.replace(" ", "T")}Z` : iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function StatusDot({ status }: { status: "running" | "error" | "ok" | "empty" }) {
  if (status === "running") {
    return <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />;
  }
  if (status === "error") {
    return <span className="inline-block w-2 h-2 rounded-full bg-destructive" />;
  }
  if (status === "ok") {
    return <span className="inline-block w-2 h-2 rounded-full bg-success" />;
  }
  return <span className="inline-block w-2 h-2 rounded-full bg-muted" />;
}

async function fetchSyncStatus(): Promise<SyncStatusResponse> {
  const resp = await fetch("/api/sync/status");
  if (!resp.ok) throw new Error(`sync/status failed: ${resp.status}`);
  return resp.json();
}

export function SyncStatusWidget({
  expanded,
  onToggle,
}: {
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const isExpanded = expanded ?? internalExpanded;
  const toggleExpanded = onToggle ?? (() => setInternalExpanded((v) => !v));

  const { data, isError } = useQuery<SyncStatusResponse>({
    queryKey: ["sync-status"],
    queryFn: fetchSyncStatus,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const handleRun = async () => {
    setRunning(true);
    try {
      // force — игнорируем интервалы, чтобы наглядно увидеть процесс
      await fetch("/api/sync/run?force=1", { method: "POST" });
    } catch {
      // статус отобразится на следующем опросе
    }
    setTimeout(() => setRunning(false), 1500);
  };

  const resources = useMemo(() => {
    const map = new Map<string, { last: string; status: string; error: string | null; rows: number }>();
    for (const st of data?.states ?? []) {
      const cur = map.get(st.resource) ?? { last: "", status: "empty", error: null, rows: 0 };
      cur.rows += 1;
      if (parseIso(st.last_success_at) > parseIso(cur.last)) cur.last = st.last_success_at ?? "";
      if (st.status === "running") cur.status = "running";
      else if (st.status === "error" && cur.status !== "running") cur.status = "error";
      else if (cur.status === "empty") cur.status = "ok";
      if (st.error) cur.error = st.error;
      map.set(st.resource, cur);
    }
    const list = Array.from(map.entries()).map(([resource, v]) => ({ resource, ...v }));
    list.sort(
      (a, b) =>
        RESOURCE_ORDER.indexOf(a.resource) - RESOURCE_ORDER.indexOf(b.resource),
    );
    return list;
  }, [data?.states]);

  if (isError) return null;
  if (data && !data.tileEnabled) return null;

  const anyRunning = resources.some((r) => r.status === "running");
  const anyError = resources.some((r) => r.status === "error");
  const errors = resources.filter((r) => r.status === "error" && r.error);

  return (
    <div className="mb-4 rounded-xl bg-card p-4 shadow border border-border">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <StatusDot
            status={anyRunning ? "running" : anyError ? "error" : resources.length ? "ok" : "empty"}
          />
          <h3 className="text-sm font-semibold text-foreground">Синхронизация Эвотор</h3>
          <span className="text-[11px] text-muted-foreground">обновление каждые 5 сек</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${running ? "animate-spin" : ""}`} />
            Запустить сейчас
          </button>
          <button
            onClick={toggleExpanded}
            className="p-1 text-muted-foreground hover:text-foreground transition"
            aria-label="Подробнее"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Свёрнутый статус одной строкой */}
      {!isExpanded && (
        <div className="mt-2 text-xs text-muted-foreground">
          {anyError
            ? "есть ошибки синхронизации"
            : anyRunning
              ? "идёт синхронизация…"
              : "синхронизация в норме"}
        </div>
      )}

      {isExpanded && (
      <>
      {/* Сводка */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        {data && (
          <>
            <span>
              Документов: <b className="text-foreground">{data.docs.total.toLocaleString("ru-RU")}</b>
            </span>
            <span>
              Магазинов: <b className="text-foreground">{data.counts.shops}</b>
            </span>
            <span>
              Сотрудников: <b className="text-foreground">{data.counts.employees}</b>
            </span>
            <span>
              Терминалов: <b className="text-foreground">{data.counts.devices}</b>
            </span>
            <span>
              Тенантов: <b className="text-foreground">{(data.tenants ?? []).length}</b>
            </span>
          </>
        )}
      </div>

      {/* Статусы ресурсов */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {resources.map((r) => (
          <div
            key={r.resource}
            className="rounded-lg border border-border bg-background/50 px-3 py-2"
          >
            <div className="flex items-center gap-1.5">
              <StatusDot status={r.status as "running" | "error" | "ok" | "empty"} />
              <span className="text-[11px] font-medium text-foreground truncate">
                {RESOURCE_LABELS[r.resource] ?? r.resource}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {r.status === "running"
                ? "идёт синхронизация"
                : r.status === "error"
                  ? "ошибка"
                  : r.last
                    ? timeAgo(r.last)
                    : "ещё не было"}
            </div>
          </div>
        ))}
      </div>

      {/* Детали */}
      {isExpanded && (
        <div className="mt-3 space-y-3">
          {errors.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              {errors.map((r) => (
                <div key={r.resource} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-destructive">
                      {RESOURCE_LABELS[r.resource] ?? r.resource}:
                    </span>{" "}
                    <span className="text-muted-foreground">{r.error}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data?.docs.byType?.length > 0 && (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <div className="text-[11px] font-medium text-muted-foreground mb-2">
                Документы по типам
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.docs.byType.map((t) => (
                  <span
                    key={t.type}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[10px] text-foreground"
                  >
                    {t.type}
                    <b className="text-muted-foreground">{t.n.toLocaleString("ru-RU")}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {data?.tenants?.length > 0 && (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <div className="text-[11px] font-medium text-muted-foreground mb-2">Тенанты</div>
              <div className="flex flex-wrap gap-1.5">
                {data.tenants.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[10px] text-foreground"
                  >
                    {t.id}
                    <span
                      className={
                        t.status === "active" ? "text-success" : "text-destructive"
                      }
                    >
                      {t.status}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
