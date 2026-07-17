// lib/logger.ts — структурированный логгер
// В production выводит JSON, локально — читаемый текст.
// Уровень DEBUG выключен в production через LOG_LEVEL.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): LogLevel {
  return (globalThis as any).__LOG_LEVEL__ || "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()];
}

function formatMessage(level: LogLevel, message: string, extra?: Record<string, unknown>): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...extra,
  };
  // В production (Cloudflare Workers) — JSON; локально — читаемый текст
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      const extraStr = extra ? " " + JSON.stringify(extra) : "";
      return `[${entry.ts.slice(11, 19)}] ${level.toUpperCase()} ${message}${extraStr}`;
    }
  } catch {}
  return JSON.stringify(entry);
}

function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const formatted = formatMessage(level, message, extra);
  switch (level) {
    case "error": console.error(formatted); break;
    case "warn": console.warn(formatted); break;
    case "debug": console.debug(formatted); break;
    default: console.log(formatted);
  }
}

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) => log("debug", message, extra),
  info: (message: string, extra?: Record<string, unknown>) => log("info", message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => log("warn", message, extra),
  error: (message: string, extra?: Record<string, unknown>) => log("error", message, extra),
};
