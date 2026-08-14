// Admin control for manually overriding which playlist becomes the Daily
// Challenge -- the automatic path (cleanup-stale-rooms, on its 10-minute
// cron) always picks randomly from eligible cached playlists with no way to
// choose one. Reuses the exact same buildRoundPlanFromPool()/DAILY_EXCLUDED
// the cron uses, rather than re-deriving the round-plan logic here, so a
// manually-set day is indistinguishable from an automatically-generated one.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildRoundPlanFromPool, DAILY_EXCLUDED } from "../_shared/itunes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/** Same gate as Admin.tsx's own isAdmin check: signed in with email, not just non-anonymous. */
async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, error: "Missing Authorization header" };

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data.user) return { ok: false, status: 401, error: "Invalid session" };
  if (data.user.is_anonymous) return { ok: false, status: 403, error: "Admin login required" };
  const providers = (data.user.app_metadata?.providers as string[] | undefined) ?? [];
  if (!providers.includes("email")) return { ok: false, status: 403, error: "Admin login required" };
  return { ok: true };
}

function lagosToday(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const supabase = serviceClient();
    const { action, playlistName } = await req.json();
    const today = lagosToday();

    if (action === "list") {
      const [{ data: pools }, { data: current }, { count: attemptsToday }] = await Promise.all([
        supabase.from("playlist_cache").select("playlist_name, tracks, is_artist"),
        supabase
          .from("daily_challenges")
          .select("challenge_date, number, category_name")
          .eq("challenge_date", today)
          .maybeSingle(),
        supabase.from("daily_attempts").select("id", { count: "exact", head: true }).eq("challenge_date", today),
      ]);

      const eligible = (pools ?? [])
        .filter((p) => !DAILY_EXCLUDED.has(p.playlist_name) && Array.isArray(p.tracks) && p.tracks.length >= 20)
        .map((p) => ({
          playlistName: p.playlist_name,
          isArtist: Boolean(p.is_artist),
          trackCount: p.tracks.length,
        }))
        .sort((a, b) => a.playlistName.localeCompare(b.playlistName));

      return jsonResponse({
        today: current
          ? { challengeDate: current.challenge_date, number: current.number, categoryName: current.category_name }
          : null,
        attemptsToday: attemptsToday ?? 0,
        playlists: eligible,
      });
    }

    if (action === "set") {
      if (!playlistName || typeof playlistName !== "string") {
        return jsonResponse({ error: "playlistName is required" }, 400);
      }
      if (DAILY_EXCLUDED.has(playlistName)) {
        return jsonResponse({ error: `"${playlistName}" is excluded from the Daily Challenge` }, 400);
      }

      const { data: pool, error: poolErr } = await supabase
        .from("playlist_cache")
        .select("tracks, is_artist")
        .eq("playlist_name", playlistName)
        .maybeSingle();
      if (poolErr || !pool) return jsonResponse({ error: `"${playlistName}" isn't cached yet` }, 404);
      if (!Array.isArray(pool.tracks) || pool.tracks.length < 20) {
        return jsonResponse({ error: `"${playlistName}" only has ${pool.tracks?.length ?? 0} cached tracks (needs 20+)` }, 400);
      }

      const plan = buildRoundPlanFromPool(pool.tracks, 10, Boolean(pool.is_artist));

      // Replaces today's challenge if one already exists -- daily_attempts
      // cascades on delete, so anyone who already played today loses that
      // attempt record. The client warns about this before calling "set".
      const { error: deleteErr } = await supabase.from("daily_challenges").delete().eq("challenge_date", today);
      if (deleteErr) return jsonResponse({ error: deleteErr.message }, 500);

      const { count: dailyCount } = await supabase
        .from("daily_challenges")
        .select("*", { count: "exact", head: true });
      const number = (dailyCount ?? 0) + 1;

      const { error: insertErr } = await supabase.from("daily_challenges").insert({
        challenge_date: today,
        number,
        category_name: playlistName,
        time_per_round: 15,
        plan,
      });
      if (insertErr) return jsonResponse({ error: insertErr.message }, 500);

      console.log(`[admin-daily-challenge] Manually set daily #${number} to "${playlistName}"`);
      return jsonResponse({ success: true, number, categoryName: playlistName });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[admin-daily-challenge] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
