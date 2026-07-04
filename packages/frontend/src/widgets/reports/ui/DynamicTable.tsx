import React, { useState, useEffect } from "react";
import { DynamicTableV2 } from "./DynamicTableV2";
import { DynamicTableClassic } from "./DynamicTableClassic";

interface TableData {
  [key: string]: string | number | string[];
}

interface DynamicTableProps {
  data: TableData[];
  columns?: string[];
}

const STORAGE_KEY = "dynamic_table_version";
type TableVersion = "v2" | "classic";

export const DynamicTable: React.FC<DynamicTableProps> = (props) => {
  const [version, setVersion] = useState<TableVersion>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "classic" ? "classic" : "v2"; }
    catch { return "v2"; }
  });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, version); } catch {} }, [version]);

  return (
    <div>
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <span className={`text-xs transition ${version === "v2" ? "text-gray-900 dark:text-gray-100 font-semibold" : "text-gray-400 dark:text-gray-500"}`}>Новый</span>
        <button type="button" onClick={() => setVersion(p => p === "v2" ? "classic" : "v2")} role="switch"
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${version === "classic" ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}>
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${version === "classic" ? "translate-x-5" : "translate-x-0"}`} />
        </button>
        <span className={`text-xs transition ${version === "classic" ? "text-gray-900 dark:text-gray-100 font-semibold" : "text-gray-400 dark:text-gray-500"}`}>Старый</span>
      </div>
      {version === "v2" ? <DynamicTableV2 {...props} /> : <DynamicTableClassic {...props} />}
    </div>
  );
};
