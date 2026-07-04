import { client } from "@shared/api";
import type { RawOperator } from "./model";

const employeesApi = (client as any).api?.employees;

export async function fetchOperators() {
  if (!employeesApi?.$get) {
    return [] as RawOperator[];
  }

  const response = await employeesApi.$get();
  if (!response.ok) {
    throw new Error("Не удалось загрузить операторов");
  }

  const payload = await response.json();
  return Array.isArray(payload?.items) ? (payload.items as RawOperator[]) : [];
}
