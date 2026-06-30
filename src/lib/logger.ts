/**
 * Centralized structured logger for the application.
 *
 * Uses a lightweight console-based structured logger. All code must import
 * from this module instead of using `console.*` directly.
 *
 * @example
 * ```typescript
 * import { logger } from "@/lib/logger";
 *
 * logger.info("api.request.start", { method: "POST", path: "/api/signals" });
 * logger.error("api.request.error", { error: String(err) });
 * ```
 */

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogBindings {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function getMinLevel(): number {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return LOG_LEVELS[envLevel as LogLevel];
  }
  return process.env.NODE_ENV === "production" ? 20 : 10;
}

function formatMessage(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
): string {
  const timestamp = new Date().toISOString();
  const base = { level: LOG_LEVELS[level], time: timestamp, msg };
  const entry = data ? { ...base, ...data } : base;
  return JSON.stringify(entry);
}

class Logger {
  private bindings: LogBindings = {};

  constructor(bindings?: LogBindings) {
    this.bindings = bindings ?? {};
  }

  /** Create a child logger with additional bindings. */
  child(bindings: LogBindings): Logger {
    const child = new Logger({ ...this.bindings, ...bindings });
    return child;
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this._log("debug", msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this._log("info", msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this._log("warn", msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this._log("error", msg, data);
  }

  fatal(msg: string, data?: Record<string, unknown>): void {
    this._log("fatal", msg, data);
  }

  private _log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < getMinLevel()) return;

    const merged = { ...this.bindings, ...data };
    const formatted = formatMessage(level, msg, merged);

    switch (level) {
      case "debug":
         
        console.debug(formatted);
        break;
      case "info":
         
        console.info(formatted);
        break;
      case "warn":
         
        console.warn(formatted);
        break;
      case "error":
      case "fatal":
         
        console.error(formatted);
        break;
    }
  }
}

/** Global singleton logger instance. */
export const logger = new Logger();
