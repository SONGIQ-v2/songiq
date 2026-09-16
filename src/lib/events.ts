// Partner-event challenges (e.g. /bnb for Beach & Beyond): sign-in gated,
// randomly-redrawn songs every play (reuses Solo mode's mechanic), replayable
// with only the most recent attempt kept. See submit_event_attempt() in
// supabase/migrations/20260915090000_events.sql for the server-side rules
// this mirrors (last-write-wins, anonymous callers rejected, deadline enforced).

import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/clientLogger";

export interface Event {
  slug: string;
  name: string;
  playlist_id: string;
  ends_at: string;
  is_active: boolean;
  background_image_url: string | null;
  accent_color: string | null;
  prize_label: string | null;
}

export interface EventAttempt {
  event_slug: string;
  player_id: string;
  player_name: string;
  score: number;
  correct_count: number;
  avg_response_ms: number | null;
  play_count: number;
  updated_at: string;
}

const EVENT_ATTEMPT_COLUMNS =
  "event_slug, player_id, player_name, score, correct_count, avg_response_ms, play_count, updated_at";

export async function fetchEvent(slug: string): Promise<Event | null> {
  const { data, error } = await (supabase as any)
    .from("events")
    .select("slug, name, playlist_id, ends_at, is_active, background_image_url, accent_color, prize_label")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as Event;
}

/** Leaderboard entries for an event, best score first. */
export async function fetchEventLeaderboard(slug: string): Promise<EventAttempt[]> {
  const { data, error } = await (supabase as any)
    .from("event_attempts")
    .select(EVENT_ATTEMPT_COLUMNS)
    .eq("event_slug", slug)
    .order("score", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data as EventAttempt[];
}

/** This player's (single, replaceable) attempt, regardless of leaderboard position. */
export async function fetchMyEventAttempt(slug: string, playerId: string): Promise<EventAttempt | null> {
  const { data } = await (supabase as any)
    .from("event_attempts")
    .select(EVENT_ATTEMPT_COLUMNS)
    .eq("event_slug", slug)
    .eq("player_id", playerId)
    .maybeSingle();
  return (data as EventAttempt) ?? null;
}

/**
 * Records (or overwrites) the calling player's attempt via the
 * submit_event_attempt() RPC -- server-side rejects anonymous callers and
 * submissions past the event's ends_at, so this can't be bypassed by
 * calling it directly.
 */
export async function submitEventAttempt(
  slug: string,
  score: number,
  correctCount: number,
  avgResponseMs: number | null = null
): Promise<boolean> {
  const { error } = await (supabase as any).rpc("submit_event_attempt", {
    p_event_slug: slug,
    p_score: score,
    p_correct_count: correctCount,
    p_avg_response_ms: avgResponseMs,
  });
  if (error) {
    logError("event.attempt_failed", "Failed to record event attempt", {
      slug,
      error: error.message,
    });
  }
  return !error;
}
