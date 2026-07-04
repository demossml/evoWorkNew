export type LeadEntity = {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  source: string;
  createdAt: string;
};

export type RawLead = Partial<{
  id: string | number;
  fullName: string;
  phone: string;
  status: string;
  source: string;
  createdAt: string;
}>;

export function normalizeLead(raw: RawLead): LeadEntity {
  return {
    id: String(raw.id ?? ""),
    fullName: typeof raw.fullName === "string" ? raw.fullName : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
    status: typeof raw.status === "string" ? raw.status : "new",
    source: typeof raw.source === "string" ? raw.source : "unknown",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
  };
}

export function normalizeLeads(rows: RawLead[]): LeadEntity[] {
  return rows.map(normalizeLead);
}
