// Challenge links: snapshot a finished game's rounds so anyone with the link
// replays the exact same songs and options, competing against the creator's score.

import { supabase } from "@/integrations/supabase/client";
import { generateRoomCode } from "@/lib/spotify";
import { logError } from "@/lib/clientLogger";

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
}

/**
 * Record a player's (single) attempt. Returns false if it couldn't be saved —
 * including when this player already has an attempt (unique constraint).
 */
export async function submitChallengeAttempt(
  code: string,
  playerId: string,
  playerName: string,
  score: number,
  correctCount: number
): Promise<boolean> {
  const { error } = await (supabase as any).from("challenge_attempts").insert({
    challenge_code: code.toUpperCase(),
    player_id: playerId,
    player_name: playerName,
    score,
    correct_count: correctCount,
  });
  if (error && !/duplicate|unique/i.test(error.message || "")) {
    logError("challenge.attempt_failed", "Failed to record challenge attempt", {
      code,
      error: error.message,
    });
  }
  return !error;
}

/** This player's attempt, regardless of leaderboard position. */
export async function fetchMyChallengeAttempt(
  code: string,
  playerId: string
): Promise<ChallengeAttempt | null> {
  const { data } = await (supabase as any)
    .from("challenge_attempts")
    .select("player_id, player_name, score, correct_count")
    .eq("challenge_code", code.toUpperCase())
    .eq("player_id", playerId)
    .maybeSingle();
  return (data as ChallengeAttempt) ?? null;
}

/** Leaderboard entries for a challenge, best score first. */
export async function fetchChallengeAttempts(code: string): Promise<ChallengeAttempt[]> {
  const { data, error } = await (supabase as any)
    .from("challenge_attempts")
    .select("player_id, player_name, score, correct_count")
    .eq("challenge_code", code.toUpperCase())
    .order("score", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data as ChallengeAttempt[];
}

export async function fetchChallenge(code: string): Promise<Challenge | null> {
  const { data, error } = await (supabase as any)
    .from("challenges")
    .select("code, creator_id, creator_name, creator_score, category_name, time_per_round, plan")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error || !data) return null;

  const plan = typeof data.plan === "string" ? JSON.parse(data.plan) : data.plan;
  if (!Array.isArray(plan) || plan.length === 0) return null;

  return { ...data, plan } as Challenge;
}
