import { supabase } from "@/integrations/supabase/client";

/** Which of these player_ids belong to a real, signed-in (non-anonymous) account. */
export async function fetchVerifiedPlayerIds(
  playerIds: (string | null | undefined)[]
): Promise<Set<string>> {
  const unique = Array.from(new Set(playerIds.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return new Set();

  const { data, error } = await (supabase as any).rpc("verified_player_ids", { p_ids: unique });
  if (error) {
    console.error("fetchVerifiedPlayerIds failed:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { player_id: string }) => r.player_id));
}
