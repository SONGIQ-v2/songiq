// Per-round saving for single-attempt games (Daily, challenge links).
//
// Every answered round is sent to the server right away (record_daily_round /
// record_challenge_round), so closing the tab mid-game can't be used to
// restart with answers already seen, and an accidental close resumes from the
// next round. Rounds go out strictly in order, and anything not yet confirmed
// is kept in localStorage -- answering offline and then closing the app
// can't drop a round whose answer was already revealed; it's sent the next
// time this play is opened.

export interface PendingRound {
  round: number; // 1-based
  correct: boolean;
  points: number;
  ms: number | null; // answer time; null on timeout
}

/** One stored round, as kept in the attempt's round_results column. */
export interface RoundResult {
  c: boolean;
  p: number;
  ms: number | null;
}

/**
 * "done": the server accepted the round, or refused it for good (stale or
 *         out-of-order play) -- either way, stop sending it.
 * "retry": a network/server hiccup; keep it and try again.
 * "unavailable": the per-round RPC doesn't exist yet (frontend deployed
 *         before the migration) -- caller falls back to the old end-of-game save.
 */
export type SendOutcome = "done" | "retry" | "unavailable";
export type FlushOutcome = "ok" | "failed" | "unavailable";

export type RoundSender = (round: PendingRound) => Promise<SendOutcome>;

/** YYYY-MM-DD in Lagos time (UTC+1), the app's day boundary. */
function lagosDate(ms: number): string {
  return new Date(ms + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Unfinished but still resumable: in progress and started today (Lagos).
 * An unfinished play is final at midnight -- same rule the RPCs enforce.
 */
export function isPlayActive(attempt: { in_progress?: boolean | null; created_at?: string | null } | null): boolean {
  if (!attempt?.in_progress || !attempt.created_at) return false;
  return lagosDate(new Date(attempt.created_at).getTime()) === lagosDate(Date.now());
}

const STORAGE_PREFIX = "songiq_pending_rounds:";

function load(key: string): PendingRound[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(key: string, list: PendingRound[]) {
  try {
    if (list.length) localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(list));
    else localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* storage unavailable -- in-memory flush still works this session */
  }
}

// In-memory copy so a blocked localStorage doesn't lose rounds mid-session.
const memory = new Map<string, PendingRound[]>();
const chains = new Map<string, Promise<FlushOutcome>>();

function pending(key: string): PendingRound[] {
  return memory.get(key) ?? load(key);
}

function setPending(key: string, list: PendingRound[]) {
  memory.set(key, list);
  save(key, list);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function drain(key: string, send: RoundSender, attempts: number): Promise<FlushOutcome> {
  for (;;) {
    const list = pending(key);
    if (list.length === 0) return "ok";
    const next = [...list].sort((a, b) => a.round - b.round)[0];
    let outcome: SendOutcome = "retry";
    for (let i = 0; i < attempts; i++) {
      try {
        outcome = await send(next);
      } catch {
        outcome = "retry";
      }
      if (outcome !== "retry") break;
      if (i < attempts - 1) await sleep(500 * 2 ** i);
    }
    if (outcome === "retry") return "failed";
    if (outcome === "unavailable") return "unavailable";
    setPending(
      key,
      pending(key).filter((r) => r.round !== next.round)
    );
  }
}

/** Queue a round and start sending it (in order, after anything earlier). */
export function enqueueRound(key: string, round: PendingRound, send: RoundSender): void {
  const list = pending(key);
  if (!list.some((r) => r.round === round.round)) setPending(key, [...list, round]);
  void flushRounds(key, send);
}

/** Send everything pending for this play; resolves once the queue is empty or stuck. */
export function flushRounds(key: string, send: RoundSender, attempts = 3): Promise<FlushOutcome> {
  const prev = chains.get(key) ?? Promise.resolve<FlushOutcome>("ok");
  const next = prev.catch(() => "failed" as FlushOutcome).then(() => drain(key, send, attempts));
  chains.set(key, next);
  return next;
}

/** True when rounds for this play are still waiting to be confirmed. */
export function hasPendingRounds(key: string): boolean {
  return pending(key).length > 0;
}

/** Drop anything queued for this play (e.g. after a legacy fallback save). */
export function clearPendingRounds(key: string): void {
  setPending(key, []);
}

/**
 * Classify a Supabase RPC error. Missing function (frontend deployed before
 * the migration) -> "unavailable"; Postgres-raised errors (ended, invalid
 * round, not found) are permanent -> "done"; anything else (network, 5xx,
 * timeouts) -> "retry".
 */
export function classifyRpcError(error: { code?: string; message?: string; status?: number } | null): SendOutcome {
  if (!error) return "done";
  const code = error.code ?? "";
  if (code === "PGRST202" || code === "42883" || error.status === 404) return "unavailable";
  if (code === "P0001" || code === "22P02" || code === "23514") return "done";
  return "retry";
}
