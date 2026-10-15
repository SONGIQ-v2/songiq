// Unscrambles Daily / challenge plans downloaded from the server.
//
// The server replaces each round's answer fields (title, artist, track id,
// artwork) with one scrambled field "x" -- XOR with this key plus a per-game
// salt, then base64 -- so the answers aren't readable in the DevTools
// Network tab (see supabase/migrations/20261016100000_scrambled_plans.sql).
// This deters casual peeking; it isn't encryption, since the key ships here.

import type { ChallengeRound } from "@/lib/challenges";

// Must match plan_scramble_key() in the migration above.
const PLAN_SCRAMBLE_KEY = "sq9-Lg7r#Afro2026-vT4m";

function unscrambleText(b64: string, key: string): string {
  const bin = atob(b64);
  const keyBytes = new TextEncoder().encode(key);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i) ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(out);
}

/**
 * Restore the answer fields on every round that carries a scrambled "x".
 * Rounds without one (a creator's own challenge, or a plan from before
 * scrambling) are returned unchanged.
 */
export function unscramblePlan(plan: unknown[], salt: string): ChallengeRound[] {
  const key = `${PLAN_SCRAMBLE_KEY}:${salt}`;
  return plan.map((raw) => {
    const round = raw as ChallengeRound & { x?: string };
    if (typeof round.x !== "string") return round;
    const { x, ...rest } = round;
    const hidden = JSON.parse(unscrambleText(x, key)) as { t?: string; a?: string; i?: string; w?: string };
    return {
      ...rest,
      track_name: hidden.t ?? "",
      artist_name: hidden.a ?? "",
      track_id: hidden.i ?? "",
      artwork_url: hidden.w ?? "",
    } as ChallengeRound;
  });
}
