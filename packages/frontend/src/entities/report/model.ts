export type ReportEntity = {
  id: string;
  type: string;
  createdAt: string;
  status: string;
};

export type RawReport = Partial<{
  id: string | number;
  type: string;
  createdAt: string;
  status: string;
}>;

export function normalizeReport(raw: RawReport): ReportEntity {
  return {
    id: String(raw.id ?? ""),
    type: typeof raw.type === "string" ? raw.type : "unknown",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    status: typeof raw.status === "string" ? raw.status : "pending",
  };
}

export function normalizeReports(rows: RawReport[]): ReportEntity[] {
  return rows.map(normalizeReport);
}
