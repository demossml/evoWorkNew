export type OperatorEntity = {
  uuid: string;
  name: string;
  shopUuid: string;
  role: string;
};

export type RawOperator = Partial<{
  employeeUuid: string;
  name: string;
  shopUuid: string;
  role: string;
}>;

export function normalizeOperator(raw: RawOperator): OperatorEntity {
  return {
    uuid: typeof raw.employeeUuid === "string" ? raw.employeeUuid : "",
    name: typeof raw.name === "string" ? raw.name : "",
    shopUuid: typeof raw.shopUuid === "string" ? raw.shopUuid : "",
    role: typeof raw.role === "string" ? raw.role : "CASHIER",
  };
}

export function normalizeOperators(rows: RawOperator[]): OperatorEntity[] {
  return rows.map(normalizeOperator);
}
