// Sends a test push notification to the calling player's own subscriptions.
// Verifies the whole pipeline (VAPID keys, encryption, delivery) on demand
// instead of waiting for a scheduled reminder slot.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Authenticate the caller (same pattern as apple-music)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, reason: "unauthorized" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: authError } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    const playerId = claims?.claims?.sub;
    if (authError || !playerId) return json({ ok: false, reason: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vapid } = await admin
      .from("push_vapid")
      .select("public_key, private_key")
      .eq("id", 1)
      .maybeSingle();
    if (!vapid) return json({ ok: false, reason: "no_vapid" });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("*")
      .eq("player_id", playerId);
    if (!subs || subs.length === 0) return json({ ok: false, reason: "no_subscription" });

    webpush.setVapidDetails("mailto:hello@songiq.xyz", vapid.public_key, vapid.private_key);

    const payload = JSON.stringify({
      title: "🔔 SongIQ test notification",
      body: "Push reminders are working on this device!",
      url: "/daily",
    });

    let sent = 0;
    let pruned = 0;
    const errors: number[] = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { urgency: "high", TTL: 300 }
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode ?? 0;
        errors.push(status);
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          pruned++;
        }
        console.error("[push-test] send failed:", status, (e as Error)?.message);
      }
    }

    return json({ ok: sent > 0, sent, pruned, errors });
  } catch (err) {
    console.error("[push-test] Error:", err);
    return json({ ok: false, reason: "error", message: String(err) }, 500);
  }
});
