export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface RequestTimings {
  start: number;
  staticLookup?: number;
  ssrStart?: number;
  ssrEnd?: number;
  total?: number;
}

export function startTimings(): RequestTimings {
  return { start: now() };
}

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function buildServerTimingHeader(timings: RequestTimings): string {
  const parts: string[] = [];
  if (timings.staticLookup !== undefined) {
    parts.push(`static;dur=${(timings.staticLookup - timings.start).toFixed(1)}`);
  }
  if (timings.ssrStart !== undefined && timings.ssrEnd !== undefined) {
    parts.push(`ssr;dur=${(timings.ssrEnd - timings.ssrStart).toFixed(1)}`);
  }
  if (timings.total !== undefined) {
    parts.push(`total;dur=${(timings.total - timings.start).toFixed(1)}`);
  }
  return parts.join(", ");
}

export function makeLogger(enabled: boolean, level: LogLevel) {
  const min = LEVEL_RANK[level];
  const log = (lv: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (!enabled || LEVEL_RANK[lv] < min) return;
    const payload = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
    if (lv === "error") console.error(payload);
    else if (lv === "warn") console.warn(payload);
    else console.log(payload);
  };
  return {
    debug: (m: string, meta?: Record<string, unknown>) => log("debug", m, meta),
    info: (m: string, meta?: Record<string, unknown>) => log("info", m, meta),
    warn: (m: string, meta?: Record<string, unknown>) => log("warn", m, meta),
    error: (m: string, meta?: Record<string, unknown>) => log("error", m, meta),
  };
}

export function generateRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
