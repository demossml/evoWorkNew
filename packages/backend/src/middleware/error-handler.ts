// middleware/error-handler.ts — единый onError для Hono
// Маппит AppError → HTTP statusCode, неизвестные ошибки → 500 без утечки деталей

import type { Context } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    logger.warn(`[${err.code}] ${err.message}`, { statusCode: err.statusCode });
    return c.json(
      { success: false, error: { code: err.code, message: err.message } },
      err.statusCode as StatusCode,
    );
  }

  // Неизвестная ошибка — логируем полностью, клиенту отдаём общее сообщение
  logger.error(err.message, { stack: err.stack, name: err.name });

  const isProduction = !!(globalThis as any).__IS_PRODUCTION__;
  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: isProduction ? "Внутренняя ошибка сервера" : err.message,
      },
    },
    500,
  );
}
