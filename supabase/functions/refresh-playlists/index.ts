// Daily playlist cache refresh — re-fetches every cached playlist's track
// pool from iTunes so new releases show up each morning and players are
// always served from a warm cache. Triggered by pg_cron; requires the
// service-role key as the bearer token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchPlaylistPool } from "../_shared/itunes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_AGE_MS = 60 * 60 * 1000; // skip pools refreshed within the last hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const { data: rows, error } = await admin
      .from("playlist_cache")
      .select("playlist_name, search_terms, updated_at");
    if (error) throw error;

    const results: Array<{ playlist: string; status: string; tracks?: number }> = [];

    for (const row of rows ?? []) {
      const age = Date.now() - new Date(row.updated_at).getTime();
      if (age < MIN_AGE_MS) {
        results.push({ playlist: row.playlist_name, status: "skipped_fresh" });
        continue;
      }

      try {
        const terms = Array.isArray(row.search_terms) ? row.search_terms : [];
        if (terms.length === 0) {
          results.push({ playlist: row.playlist_name, status: "skipped_no_terms" });
          continue;
        }

        const { pool, image } = await fetchPlaylistPool(terms, 50);
        if (pool.length === 0) {
          results.push({ playlist: row.playlist_name, status: "skipped_empty_result" });
          continue;
        }

        await admin.from("playlist_cache").upsert({
          playlist_name: row.playlist_name,
          search_terms: terms,
          tracks: pool,
          image_url: image,
          updated_at: new Date().toISOString(),
        });
        results.push({ playlist: row.playlist_name, status: "refreshed", tracks: pool.length });
      } catch (e) {
        console.error(`[Refresh] Failed for ${row.playlist_name}:`, e);
        results.push({ playlist: row.playlist_name, status: "error" });
      }
    }

    console.log(`[Refresh] Done: ${results.filter((r) => r.status === "refreshed").length}/${results.length} refreshed`);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Refresh] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
