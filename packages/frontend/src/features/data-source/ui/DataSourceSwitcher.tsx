import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataSourceStore } from "@shared/model/dataSourceStore";
import {
  invalidateDashboardQueries,
  queryKeys,
  updateDataMode,
} from "@shared/api";

export function DataSourceSwitcher() {
  const queryClient = useQueryClient();
  const dataSource = useDataSourceStore((state) => state.dataSource);
  const [pendingMode, setPendingMode] = useState(dataSource);

  const updateModeMutation = useMutation({
    mutationFn: updateDataMode,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.dataMode() }),
        invalidateDashboardQueries(queryClient),
      ]);
    },
  });

  useEffect(() => {
    setPendingMode(dataSource);
  }, [dataSource]);

  return (
    <div className="rounded-lg border border-blue-300/50 dark:border-blue-400/40 bg-blue-50/80 dark:bg-slate-800/80 px-3 py-2">
      <div className="text-xs text-gray-700 dark:text-gray-200 mb-2">
        Источник данных: <span className="font-semibold">{dataSource}</span>
      </div>
      <div className="flex gap-2 items-center">
        <select
          value={pendingMode}
          onChange={(e) => setPendingMode(e.target.value as "DB" | "ELVATOR")}
          className="rounded-md border border-gray-300 dark:border-white/20 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-gray-900 dark:text-white"
          disabled={updateModeMutation.isPending}
        >
          <option value="DB">DB</option>
          <option value="ELVATOR">ELVATOR</option>
        </select>
        <button
          onClick={() => {
            if (pendingMode === dataSource) return;
            updateModeMutation.mutate(pendingMode);
          }}
          disabled={updateModeMutation.isPending || pendingMode === dataSource}
          className="rounded-md bg-white text-slate-900 px-3 py-1 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {updateModeMutation.isPending ? "Сохранение..." : "Применить"}
        </button>
      </div>
      {updateModeMutation.error && (
        <div className="mt-2 text-xs text-red-300">
          {updateModeMutation.error.message}
        </div>
      )}
    </div>
  );
}
