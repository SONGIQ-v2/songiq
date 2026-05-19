import { supabase } from "@/integrations/supabase/client";

type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  level?: LogLevel;
  event?: string;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
  roomId?: string | null;
  roomCode?: string | null;
}

// Lightweight in-memory rate limit so we don't flood the table
const recent = new Map<string, number>();
const DEDUPE_MS = 5000;

function shouldSkip(key: string) {
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (now - last < DEDUPE_MS) return true;
  recent.set(key, now);
  if (recent.size > 200) {
    // trim old entries
    for (const [k, t] of recent) {
      if (now - t > DEDUPE_MS * 4) recent.delete(k);
    }
  }
  return false;
}

export async function logClientEvent(payload: LogPayload): Promise<void> {
  try {
    const key = `${payload.level ?? "info"}:${payload.event ?? ""}:${payload.message}`;
    if (shouldSkip(key)) return;

    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("client_logs").insert({
      level: payload.level ?? "info",
      event: payload.event ?? null,
      message: payload.message.slice(0, 2000),
      context: (payload.context ?? {}) as never,
      stack: payload.stack?.slice(0, 4000) ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      player_id: user?.id ?? null,
      room_id: payload.roomId ?? null,
      room_code: payload.roomCode ?? null,
    });
  } catch {
    // Never throw from a logger
  }
}

export const logInfo = (event: string, message: string, context?: Record<string, unknown>) =>
  logClientEvent({ level: "info", event, message, context });

export const logWarn = (event: string, message: string, context?: Record<string, unknown>) =>
  logClientEvent({ level: "warn", event, message, context });

export const logError = (event: string, message: string, context?: Record<string, unknown>, stack?: string) =>
  logClientEvent({ level: "error", event, message, context, stack });

let installed = false;
export function installGlobalErrorLogging() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    logClientEvent({
      level: "error",
      event: "window.error",
      message: e.message || "Unknown error",
      stack: e.error?.stack,
      context: {
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const message =
      typeof reason === "string"
        ? reason
        : reason?.message ?? "Unhandled promise rejection";
    logClientEvent({
      level: "error",
      event: "unhandledrejection",
      message,
      stack: reason?.stack,
    });
  });
}
