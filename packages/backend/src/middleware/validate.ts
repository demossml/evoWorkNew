// middleware/validate.ts — zod-валидация тела/query/params запроса
// Бросает ValidationError при несоответствии схеме.

import type { ZodSchema, ZodTypeDef } from "zod";
import type { Context } from "hono";
import { ValidationError } from "../lib/errors";

export function validateBody<T>(c: Context, schema: ZodSchema<T, ZodTypeDef, unknown>): Promise<T> {
  return c.req.json().then((body) => {
    const result = schema.safeParse(body);
    if (!result.success) {
      const details = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new ValidationError("Ошибка валидации запроса", details);
    }
    return result.data;
  });
}

export function validateQuery<T>(c: Context, schema: ZodSchema<T, ZodTypeDef, unknown>): T {
  const query = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const result = schema.safeParse(query);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ValidationError("Ошибка валидации параметров", details);
  }
  return result.data;
}
