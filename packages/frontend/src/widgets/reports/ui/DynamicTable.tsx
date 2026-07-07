import React from "react";
import { DynamicTableV2 } from "./DynamicTableV2";

interface TableData {
  [key: string]: string | number | string[];
}

interface DynamicTableProps {
  data: TableData[];
  columns?: string[];
}

/**
 * Previously this rendered either DynamicTableV2 or DynamicTableClassic
 * behind a user-facing "Новый/Старый" toggle persisted to localStorage.
 * The two were near-identical — same structure, same behavior, only
 * cosmetic differences (padding, gray vs slate, a couple px of spacing).
 * Classic added no functionality V2 didn't already have, so it's been
 * removed rather than maintained as a second copy of the same table.
 */
export const DynamicTable: React.FC<DynamicTableProps> = (props) => {
  return <DynamicTableV2 {...props} />;
};
