// Admin control for partner-event challenges (e.g. /bnb) -- view every
// event's live stats, reset a event's attempts for testing, and adjust its
// end date / active flag without hand-editing SQL each time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { action, slug, endsAt, isActive } = await req.json();

    if (action === "list") {
      const { data: events, error: eventsErr } = await supabase
        .from("events")
        .select("slug, name, playlist_id, ends_at, is_active, prize_label")
        .order("slug");
      if (eventsErr) return jsonResponse({ error: eventsErr.message }, 500);

      const withStats = await Promise.all(
        (events ?? []).map(async (e) => {
          const { data: top } = await supabase
            .from("event_attempts")
            .select("score")
            .eq("event_slug", e.slug)
            .order("score", { ascending: false })
            .limit(1)
            .maybeSingle();
          const { count } = await supabase
            .from("event_attempts")
            .select("*", { count: "exact", head: true })
            .eq("event_slug", e.slug);
          return { ...e, attemptCount: count ?? 0, topScore: top?.score ?? null };
        })
      );

      return jsonResponse({ events: withStats });
    }

    if (action === "reset") {
      if (!slug || typeof slug !== "string") return jsonResponse({ error: "slug is required" }, 400);
      const { error: delErr, count } = await supabase
        .from("event_attempts")
        .delete({ count: "exact" })
        .eq("event_slug", slug);
      if (delErr) return jsonResponse({ error: delErr.message }, 500);
      console.log(`[admin-events] Reset "${slug}" -- ${count ?? 0} attempts deleted`);
      return jsonResponse({ success: true, deleted: count ?? 0 });
    }

    if (action === "update") {
      if (!slug || typeof slug !== "string") return jsonResponse({ error: "slug is required" }, 400);
      const patch: Record<string, unknown> = {};
      if (typeof endsAt === "string" && endsAt) patch.ends_at = endsAt;
      if (typeof isActive === "boolean") patch.is_active = isActive;
      if (Object.keys(patch).length === 0) return jsonResponse({ error: "Nothing to update" }, 400);

      const { error: updateErr } = await supabase.from("events").update(patch).eq("slug", slug);
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
      console.log(`[admin-events] Updated "${slug}":`, patch);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[admin-events] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
