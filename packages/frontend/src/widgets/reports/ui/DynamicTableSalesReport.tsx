import React from "react";
import { DynamicTableSalesReportV2 } from "./DynamicTableSalesReportV2";

type SalesReportRow = { productName: string; quantitySale: number; sum: number; costTotal?: number; profit?: number };
interface DynamicTableSalesReportProps { data: SalesReportRow[]; showProfit?: boolean; }

export const DynamicTableSalesReport: React.FC<DynamicTableSalesReportProps> = (props) => (
  <DynamicTableSalesReportV2 {...props} />
);
