// Server-side relay to Meta's Conversions API — mirrors the client-side
// Pixel's trackCustom calls, sharing the same event_id so Meta dedupes the
// browser and server copies of the same event instead of double-counting.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Pixel IDs are public (already embedded in the client-side snippet) — only
// the access token is a secret.
const PIXEL_ID = "1582626956565231";
const GRAPH_API_VERSION = "v21.0";

// This endpoint has no caller auth (it's invoked from anonymous browsers,
// same as the Pixel itself) — without an allowlist, anyone could POST
// arbitrary event_name/custom_data here and it'd forward straight to Meta
// using our stored access token, polluting ad account data. Keep this in
// sync with the event names fired by trackEvent() in src/lib/analytics.ts.
const ALLOWED_EVENTS = new Set([
  "solo_game_start", "solo_game_complete",
  "daily_challenge_start", "daily_challenge_complete",
  "challenge_create", "challenge_accept", "challenge_complete",
  "multiplayer_room_create", "multiplayer_room_join",
  "multiplayer_game_start", "multiplayer_game_complete",
  "room_link_copy", "share_result",
]);

const ALLOWED_ORIGINS = ["https://songiq.io", "https://songiq.xyz"];

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
    if (!accessToken) throw new Error("META_CAPI_ACCESS_TOKEN is not configured");

    const { event_name, event_id, custom_data, event_source_url, fbp, fbc, player_id } = await req.json();
    if (!event_name || !event_id) {
      throw new Error("event_name and event_id are required");
    }
    if (!ALLOWED_EVENTS.has(event_name)) {
      throw new Error(`event_name "${event_name}" is not allowed`);
    }
    if (typeof event_source_url !== "string" || !ALLOWED_ORIGINS.some((o) => event_source_url.startsWith(o))) {
      throw new Error("event_source_url is missing or not an allowed origin");
    }

    // Real, per-request values — more reliable than anything the client could self-report.
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = req.headers.get("user-agent") ?? undefined;

    const userData: Record<string, unknown> = {
      client_ip_address: clientIp,
      client_user_agent: userAgent,
    };
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    // external_id must be hashed — SongIQ has no email/phone to match on
    // (players are anonymous), so a stable hashed player_id is the best
    // fallback match key for Meta's attribution.
    if (player_id) userData.external_id = [await sha256Hex(player_id)];

    const payload = {
      data: [
        {
          event_name,
          event_id,
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          event_source_url,
          user_data: userData,
          custom_data: custom_data ?? {},
        },
      ],
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PIXEL_ID}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const result = await metaRes.json();
    if (!metaRes.ok) {
      console.error("[meta-capi] Meta API error:", JSON.stringify(result));
    }

    return new Response(JSON.stringify(result), {
      status: metaRes.ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error('[meta-capi] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
