import React from "react";
import { DynamicTableSalesReportV2 } from "./DynamicTableSalesReportV2";

type SalesReportRow = { productName: string; quantitySale: number; sum: number };
interface DynamicTableSalesReportProps { data: SalesReportRow[]; }

export const DynamicTableSalesReport: React.FC<DynamicTableSalesReportProps> = (props) => (
  <DynamicTableSalesReportV2 {...props} />
);
