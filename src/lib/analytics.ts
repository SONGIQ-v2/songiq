/**
 * Google Analytics 4 custom event layer.
 *
 * The gtag.js snippet lives in index.html. This module is a thin, typed wrapper
 * so components never touch `window.gtag` directly, and so events keep stable
 * names/params in the GA4 UI (Reports → Engagement → Events).
 *
 * GA4 event-name rules we respect here: snake_case, <= 40 chars, no spaces,
 * and at most 25 params per event.
 */

type GtagParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Game modes we report on. Keep in sync with GA4 custom dimension `game_mode`. */
export type GameMode = "solo" | "multiplayer" | "daily" | "challenge";

const DEBUG = import.meta.env.DEV;

/** Low-level send. Silently no-ops when gtag is blocked or not yet loaded. */
export function trackEvent(name: string, params: GtagParams = {}) {
  const clean: GtagParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  }

  if (DEBUG) console.info("[GA]", name, clean);

  try {
    window.gtag?.("event", name, clean);
  } catch {
    // analytics must never break gameplay
  }
}

/** SPA route change → page_view (gtag only auto-sends the first load). */
export function trackPageView(path: string, title?: string) {
  trackEvent("page_view", {
    page_path: path,
    page_location: window.location.origin + path,
    page_title: title ?? document.title,
  });
}

/* ------------------------------------------------------------------ */
/* Named gameplay events                                              */
/* ------------------------------------------------------------------ */

/** User picked a mode on the home screen / nav. */
export const trackModeSelected = (mode: GameMode, source = "home") =>
  trackEvent("mode_selected", { game_mode: mode, source });

/** A round-1 clip actually started for this player. */
export const trackGameStart = (mode: GameMode, category?: string, rounds?: number) =>
  trackEvent("game_start", { game_mode: mode, category, rounds });

/** Player reached the results screen. */
export const trackGameComplete = (
  mode: GameMode,
  score: number,
  correct: number,
  rounds: number,
  category?: string
) =>
  trackEvent("game_complete", {
    game_mode: mode,
    score,
    correct_answers: correct,
    rounds,
    accuracy: rounds > 0 ? Math.round((correct / rounds) * 100) : 0,
    category,
  });

/* Multiplayer */
export const trackRoomCreated = (roomCode: string) =>
  trackEvent("multiplayer_room_created", { game_mode: "multiplayer", room_code: roomCode });

export const trackRoomJoined = (roomCode: string, via: "code" | "link" = "code") =>
  trackEvent("multiplayer_room_joined", { game_mode: "multiplayer", room_code: roomCode, join_method: via });

export const trackRoomShared = (roomCode: string, method: string) =>
  trackEvent("multiplayer_room_shared", { game_mode: "multiplayer", room_code: roomCode, share_method: method });

export const trackMultiplayerStart = (roomCode: string, playerCount: number, rounds: number) =>
  trackEvent("multiplayer_game_start", {
    game_mode: "multiplayer",
    room_code: roomCode,
    player_count: playerCount,
    rounds,
  });

/* Challenge links */
export const trackChallengeCreated = (code: string, category?: string) =>
  trackEvent("challenge_created", { game_mode: "challenge", challenge_code: code, category });

export const trackChallengeShared = (code: string, method: string) =>
  trackEvent("challenge_shared", { game_mode: "challenge", challenge_code: code, share_method: method });

export const trackChallengeAccepted = (code: string) =>
  trackEvent("challenge_accepted", { game_mode: "challenge", challenge_code: code });

/* Daily challenge */
export const trackDailyStart = (date: string, number?: number) =>
  trackEvent("daily_challenge_start", { game_mode: "daily", challenge_date: date, daily_number: number });

export const trackDailyComplete = (date: string, score: number, streak?: number, rank?: number) =>
  trackEvent("daily_challenge_complete", {
    game_mode: "daily",
    challenge_date: date,
    score,
    streak,
    rank,
  });

/* Misc engagement */
export const trackShare = (contentType: string, method: string) =>
  trackEvent("share", { content_type: contentType, method });

export const trackFeedbackSubmitted = (category?: string) =>
  trackEvent("feedback_submitted", { feedback_category: category });
