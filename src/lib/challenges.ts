// Challenge links: snapshot a finished game's rounds so anyone with the link
// replays the exact same songs and options, competing against the creator's score.

import { supabase } from "@/integrations/supabase/client";
import { generateRoomCode } from "@/lib/spotify";
import { logError } from "@/lib/clientLogger";
import {
  classifyRpcError,
  type PendingRound,
  type RoundResult,
  type SendOutcome,
} from "@/lib/roundProgress";

export interface ChallengeRound {
  track_id: string;
  track_name: string;
  artist_name: string;
  preview_url: string;
  artwork_url: string;
  question_type: "song" | "artist";
  options: string[];
}

export interface Challenge {
  code: string;
  creator_id?: string | null;
  creator_name: string;
  creator_score: number;
  category_name: string;
  time_per_round: number;
  plan: ChallengeRound[];
}

export function challengeUrl(code: string): string {
  return `https://songiq.io/c/${code}`;
}

/** Read the nickname saved by multiplayer (1-year cookie), if any. */
export function getSavedUsername(): string {
  const match = document.cookie.match(/(?:^|; )songiq_username=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function saveUsername(name: string): void {
  const maxAge = 365 * 24 * 60 * 60; // 1 year
  document.cookie = `songiq_username=${encodeURIComponent(name)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Expires the multiplayer nickname cookie -- used on sign-out so a signed-out browser doesn't keep the just-signed-out account's name. */
export function clearSavedUsername(): void {
  document.cookie = "songiq_username=; path=/; max-age=0; SameSite=Lax";
}

/**
 * Best known nickname across the app's two separate saved-name stores --
 * the profile dialog's localStorage value (src/components/Header.tsx) and
 * the older multiplayer cookie above -- so a page can tell "we already
 * know this player's name" without caring which flow originally saved it.
 */
export function getKnownPlayerName(): string {
  if (typeof window === "undefined") return "";
  const profileName = window.localStorage.getItem("songiq_player_name")?.trim();
  return profileName || getSavedUsername();
}

/** Get the current user id, signing in anonymously if needed (RLS requires it). */
async function ensureUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;
  const { data } = await supabase.auth.signInAnonymously();
  return data.user?.id ?? null;
}

export async function createChallenge(input: Omit<Challenge, "code" | "creator_id">): Promise<string | null> {
  const creatorId = await ensureUserId();
  // Retry on the (unlikely) code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode();
    const { error } = await (supabase as any)
      .from("challenges")
      .insert({ code, creator_id: creatorId, ...input });
    if (!error) return code;
    if (!/duplicate|unique/i.test(error.message || "")) {
      logError("challenge.create_failed", "Failed to create challenge", {
        error: error.message,
        category: input.category_name,
      });
      return null;
    }
  }
  return null;
}

export interface ChallengeAttempt {
  player_id: string;
  player_name: string;
  score: number;
  correct_count: number;
  avg_response_ms: number | null;
  created_at: string;
  // Per-round saving (see roundProgress.ts). Old rows: in_progress false,
  // rounds_completed null, round_results [].
  in_progress?: boolean;
  rounds_completed?: number | null;
  round_results?: RoundResult[];
  updated_at?: string | null;
}

const LEGACY_ATTEMPT_COLUMNS = "player_id, player_name, score, correct_count, avg_response_ms, created_at";
const ATTEMPT_COLUMNS = `${LEGACY_ATTEMPT_COLUMNS}, in_progress, rounds_completed, round_results, updated_at`;

// Frontend shipped before the per-round migration: the new columns don't
// exist yet (Postgres 42703) -- fall back to the old query.
const isMissingColumn = (error: { code?: string } | null) => error?.code === "42703";

/** Pending-round queue key for this player's play of a challenge (roundProgress.ts). */
export function challengeProgressKey(code: string, playerId: string): string {
  return `challenge:${code.toUpperCase()}:${playerId}`;
}

/** Save one answered round of a challenge (creates the attempt on round 1). */
export async function recordChallengeRound(
  code: string,
  playerName: string,
  round: PendingRound
): Promise<SendOutcome> {
  const { error } = await (supabase as any).rpc("record_challenge_round", {
    p_code: code.toUpperCase(),
    p_round: round.round,
    p_correct: round.correct,
    p_points: round.points,
    p_answer_ms: round.ms,
    p_player_name: playerName,
  });
  const outcome = classifyRpcError(error);
  if (error && outcome === "done") {
    logError("challenge.round_rejected", "Challenge round was refused", { code, round: round.round, error: error.message });
  }
  return outcome;
}

/** In-app Leave: the current partial score becomes final. */
export async function finishChallengeAttempt(code: string): Promise<SendOutcome> {
  const { error } = await (supabase as any).rpc("finish_challenge_attempt", { p_code: code.toUpperCase() });
  return classifyRpcError(error);
}

/**
 * Legacy end-of-game save, used only if the per-round RPC isn't deployed yet.
 * "duplicate" means this player already has one (first attempt counts,
 * unique constraint) -- not a failure.
 */
export async function submitChallengeAttempt(
  code: string,
  playerId: string,
  playerName: string,
  score: number,
  correctCount: number,
  avgResponseMs: number | null = null
): Promise<"saved" | "duplicate" | "failed"> {
  const { error } = await (supabase as any).from("challenge_attempts").insert({
    challenge_code: code.toUpperCase(),
    player_id: playerId,
    player_name: playerName,
    score,
    correct_count: correctCount,
    avg_response_ms: avgResponseMs,
  });
  if (!error) return "saved";
  if (/duplicate|unique/i.test(error.message || "")) return "duplicate";
  logError("challenge.attempt_failed", "Failed to record challenge attempt", {
    code,
    error: error.message,
  });
  return "failed";
}

/** This player's attempt, regardless of leaderboard position. */
export async function fetchMyChallengeAttempt(
  code: string,
  playerId: string
): Promise<ChallengeAttempt | null> {
  const query = (legacy: boolean) =>
    (supabase as any)
      .from("challenge_attempts")
      .select(legacy ? LEGACY_ATTEMPT_COLUMNS : ATTEMPT_COLUMNS)
      .eq("challenge_code", code.toUpperCase())
      .eq("player_id", playerId)
      .maybeSingle();
  let { data, error } = await query(false);
  if (isMissingColumn(error)) ({ data } = await query(true));
  return (data as ChallengeAttempt) ?? null;
}

/**
 * Leaderboard entries for a challenge, best score first. Unfinished plays
 * are included with their score so far (in_progress = true).
 */
export async function fetchChallengeAttempts(code: string): Promise<ChallengeAttempt[]> {
  const query = (legacy: boolean) => {
    let q = (supabase as any)
      .from("challenge_attempts")
      .select(legacy ? LEGACY_ATTEMPT_COLUMNS : ATTEMPT_COLUMNS)
      .eq("challenge_code", code.toUpperCase());
    return q.order("score", { ascending: false }).limit(50);
  };
  let { data, error } = await query(false);
  if (isMissingColumn(error)) ({ data, error } = await query(true));
  if (error || !data) return [];
  return data as ChallengeAttempt[];
}

export interface PublicChallengeSummary {
  code: string;
  creator_id: string | null;
  creator_name: string;
  category_name: string;
  time_per_round: number;
  song_count: number;
  attempt_count: number;
  top_name: string;
  top_score: number;
  created_at: string;
}

export const PUBLIC_CHALLENGES_PAGE_SIZE = 20;

/** Public feed of recently created challenges, for social proof on the
 *  Browse Challenges page. Never returns `plan` -- see the RPC's own
 *  migration comment for why that matters. */
export async function listPublicChallenges(
  offset: number,
  limit: number = PUBLIC_CHALLENGES_PAGE_SIZE
): Promise<PublicChallengeSummary[]> {
  const { data, error } = await (supabase as any).rpc("list_public_challenges", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !data) return [];
  return data as PublicChallengeSummary[];
}

/** This viewer's own score on each of the given challenges, if they've
 *  already played it -- challenge_attempts is already fully public
 *  (SELECT ... USING (true)), no new RPC needed. */
export async function fetchMyChallengeScores(
  codes: string[],
  playerId: string
): Promise<Map<string, number>> {
  if (codes.length === 0) return new Map();
  const { data } = await (supabase as any)
    .from("challenge_attempts")
    .select("challenge_code, score")
    .in("challenge_code", codes)
    .eq("player_id", playerId);
  return new Map((data ?? []).map((r: any) => [r.challenge_code, r.score as number]));
}

/**
 * null = no challenge with this code. Throws on a transport/RPC error so a
 * caller can tell "doesn't exist" from "couldn't reach the server" -- both
 * used to collapse into "Challenge not found", so a recipient on a flaky
 * connection was told a perfectly good link had expired.
 */
export async function fetchChallenge(code: string): Promise<Challenge | null> {
  // Via the RPC, not a direct table select -- challenges is now scoped to
  // "your own creations" at the RLS level; a shared link's recipient is
  // neither the creator nor signed in as them, so this is the only
  // legitimate way to look one up by its code.
  const { data, error } = await (supabase as any).rpc("get_challenge_by_code", {
    p_code: code.toUpperCase(),
  });

  if (error) throw error;
  if (!data) return null;

  const plan = typeof data.plan === "string" ? JSON.parse(data.plan) : data.plan;
  if (!Array.isArray(plan) || plan.length === 0) return null;

  return { ...data, plan } as Challenge;
}
