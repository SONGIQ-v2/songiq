import { supabase } from "@/integrations/supabase/client";

export type LeaderboardRange = "week" | "month" | "all";
export type LeaderboardSort = "time" | "points";

export interface GlobalLeaderboardRow {
  rank: number;
  player_id: string;
  player_name: string;
  minutes: number;
  points: number;
  streak: number;
  is_caller: boolean;
}

/**
 * Top 100 by minutes played (or Points) over a rolling window, plus the
 * caller's own row (with true rank) when they land outside the top 100.
 */
export async function fetchGlobalLeaderboard(
  range: LeaderboardRange,
  sort: LeaderboardSort,
  playerId: string | null
): Promise<GlobalLeaderboardRow[]> {
  // (supabase as any): generated types don't know this RPC until Lovable
  // regenerates them after the migration deploys
  const { data, error } = await (supabase as any).rpc("global_leaderboard", {
    p_range: range,
    p_sort: sort,
    p_player: playerId,
  });
  if (error) throw error;
  return ((data ?? []) as GlobalLeaderboardRow[]).map((r) => ({
    ...r,
    rank: Number(r.rank),
    points: Number(r.points),
  }));
}

/** "1h 24m" / "24m" style playtime label. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Human label for when the selected window started — matching the server's
 * Lagos-calendar windows (week starts Sunday, month starts the 1st).
 */
export function rangeStartLabel(range: LeaderboardRange): string {
  if (range === "all") return "all time";
  // Today's date in Lagos, so the label matches the server's boundary
  const lagosNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const start = new Date(lagosNow);
  if (range === "week") {
    start.setDate(lagosNow.getDate() - lagosNow.getDay()); // back to Sunday
  } else {
    start.setDate(1);
  }
  return `since ${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
