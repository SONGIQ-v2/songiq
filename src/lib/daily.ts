// Daily Challenge: one shared game per day, one attempt per player,
// with streaks and leaderboards.

import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/clientLogger";
import type { ChallengeRound } from "@/lib/challenges";

export interface DailyChallenge {
  challenge_date: string; // YYYY-MM-DD
  number: number;
  category_name: string;
  time_per_round: number;
  plan: ChallengeRound[];
}

export interface DailyAttempt {
  player_id: string;
  player_name: string;
  score: number;
  correct_count: number;
}

export interface DailyStats {
  player_id: string;
  player_name: string;
  current_streak: number;
  best_streak: number;
  total_score: number;
  plays: number;
  last_played: string | null;
}

/** DailyStats plus the honest current streak (0 once it's actually lapsed). */
export interface DailyLeaderboardStats extends DailyStats {
  effective_streak: number;
}

export const DAILY_URL = "https://songiq.io/daily";

/** The most recent generated challenge (normally today's). */
export async function fetchTodayChallenge(): Promise<DailyChallenge | null> {
  const { data, error } = await (supabase as any)
    .from("daily_challenges")
    .select("challenge_date, number, category_name, time_per_round, plan")
    .order("challenge_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const plan = typeof data.plan === "string" ? JSON.parse(data.plan) : data.plan;
  if (!Array.isArray(plan) || plan.length === 0) return null;
  return { ...data, plan } as DailyChallenge;
}

/** Today's leaderboard (top 50) plus the total attempt count. */
export async function fetchDailyAttempts(
  date: string
): Promise<{ attempts: DailyAttempt[]; total: number }> {
  const { data, count, error } = await (supabase as any)
    .from("daily_attempts")
    .select("player_id, player_name, score, correct_count", { count: "exact" })
    .eq("challenge_date", date)
    .order("score", { ascending: false })
    .limit(50);
  if (error || !data) return { attempts: [], total: 0 };
  return { attempts: data as DailyAttempt[], total: count ?? data.length };
}

/** This player's attempt for the day, regardless of leaderboard position. */
export async function fetchMyDailyAttempt(
  date: string,
  playerId: string
): Promise<DailyAttempt | null> {
  const { data } = await (supabase as any)
    .from("daily_attempts")
    .select("player_id, player_name, score, correct_count")
    .eq("challenge_date", date)
    .eq("player_id", playerId)
    .maybeSingle();
  return (data as DailyAttempt) ?? null;
}

/** Record the player's (single) attempt; duplicates are rejected by the DB. */
export async function submitDailyAttempt(
  date: string,
  playerId: string,
  playerName: string,
  score: number,
  correctCount: number
): Promise<boolean> {
  const { error } = await (supabase as any).from("daily_attempts").insert({
    challenge_date: date,
    player_id: playerId,
    player_name: playerName,
    score,
    correct_count: correctCount,
  });
  if (error && !/duplicate|unique/i.test(error.message || "")) {
    logError("daily.attempt_failed", "Failed to record daily attempt", {
      date,
      error: error.message,
    });
  }
  return !error;
}

/** This player's rank for the day (1-based) and the total player count. */
export async function fetchMyDailyRank(
  date: string,
  myScore: number
): Promise<{ rank: number; total: number }> {
  const [{ count: above }, { count: total }] = await Promise.all([
    (supabase as any)
      .from("daily_attempts")
      .select("*", { count: "exact", head: true })
      .eq("challenge_date", date)
      .gt("score", myScore),
    (supabase as any)
      .from("daily_attempts")
      .select("*", { count: "exact", head: true })
      .eq("challenge_date", date),
  ]);
  return { rank: (above ?? 0) + 1, total: total ?? 0 };
}

/** All-time board: longest active streaks first. */
export async function fetchDailyStatsLeaderboard(): Promise<DailyLeaderboardStats[]> {
  const { data, error } = await (supabase as any)
    .from("daily_stats_leaderboard")
    .select("*")
    .order("effective_streak", { ascending: false })
    .order("total_score", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data as DailyLeaderboardStats[];
}

export async function fetchMyDailyStats(playerId: string): Promise<DailyStats | null> {
  const { data } = await (supabase as any)
    .from("daily_stats")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  return (data as DailyStats) ?? null;
}

/** Streak stats for a specific set of players, keyed by player_id — used to merge
 *  streaks into a score-ranked list (e.g. today's leaderboard) without pulling the
 *  separate all-time-by-streak board. */
export async function fetchDailyStatsForPlayers(playerIds: string[]): Promise<Record<string, DailyStats>> {
  if (playerIds.length === 0) return {};
  const { data } = await (supabase as any)
    .from("daily_stats")
    .select("*")
    .in("player_id", playerIds);
  const byId: Record<string, DailyStats> = {};
  for (const row of (data as DailyStats[]) ?? []) byId[row.player_id] = row;
  return byId;
}

export type StreakStatus = "active" | "at_risk" | "save_available_today" | "repair" | "lost" | "none";

export interface StreakProtectionStatus {
  current_streak: number;
  last_played: string | null;
  saves_available: number;
  next_save_expires: string | null;
  status: StreakStatus;
  repair_day_number: number | null;
  repair_target_friends: number | null;
  repair_progress_friends: number | null;
  repair_target_challenges: number | null;
  repair_progress_challenges: number | null;
  repair_deadline: string | null;
}

/** Full Streak Save + repair-window status for the signed-in caller
 *  (server-computed via auth.uid() -- there's no "for another player"
 *  variant, this is always "my own" status). */
export async function fetchStreakProtectionStatus(): Promise<StreakProtectionStatus | null> {
  const { data, error } = await (supabase as any).rpc("get_streak_protection_status");
  if (error || !data || data.length === 0) return null;
  return data[0] as StreakProtectionStatus;
}

/** A streak only counts if it includes today or yesterday (Lagos time). */
export function isStreakActive(stats: DailyStats | null): boolean {
  if (!stats?.last_played) return false;
  const lagosNow = new Date(Date.now() + 60 * 60 * 1000);
  const today = lagosNow.toISOString().slice(0, 10);
  const yesterday = new Date(lagosNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return stats.last_played === today || stats.last_played === yesterday;
}

/** Streak (>=2) that's still alive but hasn't been extended today yet --
 *  played yesterday, not today, so it lapses if today passes with no play. */
export function isStreakAtRisk(stats: DailyStats | null): boolean {
  if (!stats?.last_played || stats.current_streak < 2) return false;
  const lagosNow = new Date(Date.now() + 60 * 60 * 1000);
  const yesterday = new Date(lagosNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return stats.last_played === yesterday;
}

export function buildDailyShareText(opts: {
  number: number;
  categoryName: string;
  score: number;
  results: boolean[];
  streak?: number;
}): string {
  const grid = opts.results.map((r) => (r ? "🟩" : "🟥")).join("");
  const correct = opts.results.filter(Boolean).length;
  const lines = [
    `🎵 SongIQ Daily #${opts.number} — ${opts.categoryName}`,
    `${grid} ${correct}/${opts.results.length} · ${opts.score} pts`,
  ];
  if (opts.streak && opts.streak > 1) lines.push(`🔥 ${opts.streak}-day streak`);
  lines.push("", `Same songs for everyone, once a day 👉 ${DAILY_URL}`);
  return lines.join("\n");
}
