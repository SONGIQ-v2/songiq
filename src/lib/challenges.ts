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
  creator_name: string;
  creator_score: number;
  category_name: string;
  time_per_round: number;
  plan: ChallengeRound[];
}

export function challengeUrl(code: string): string {
  return `https://songiq.xyz/c/${code}`;
}

/** Read the nickname saved by multiplayer (1-year cookie), if any. */
export function getSavedUsername(): string {
  const match = document.cookie.match(/(?:^|; )songiq_username=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function createChallenge(input: Omit<Challenge, "code">): Promise<string | null> {
  // Retry on the (unlikely) code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode();
    const { error } = await (supabase as any).from("challenges").insert({ code, ...input });
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

export async function fetchChallenge(code: string): Promise<Challenge | null> {
  const { data, error } = await (supabase as any)
    .from("challenges")
    .select("code, creator_name, creator_score, category_name, time_per_round, plan")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error || !data) return null;

  const plan = typeof data.plan === "string" ? JSON.parse(data.plan) : data.plan;
  if (!Array.isArray(plan) || plan.length === 0) return null;

  return { ...data, plan } as Challenge;
}
