// Admin dashboard data: GA4 event reports + a few Supabase-only stats.
//
// Two separate credentials are involved, easy to conflate:
//   1. Who can call this function at all -- the caller's own Supabase
//      session, which must be authenticated and NON-anonymous (checked
//      below). This is the "/admin login" gate.
//   2. How this function talks to Google's GA4 API -- a stored refresh
//      token (see the "connect" action), obtained once via a real Google
//      OAuth consent, unrelated to any SongIQ player's identity.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GA4_CLIENT_ID = Deno.env.get("GA4_CLIENT_ID")!;
const GA4_CLIENT_SECRET = Deno.env.get("GA4_CLIENT_SECRET")!;
const GA4_PROPERTY_ID = Deno.env.get("GA4_PROPERTY_ID")!;
const GA4_REDIRECT_URI = Deno.env.get("GA4_REDIRECT_URI")!; // must exactly match the OAuth client's authorized redirect URI

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/** Rejects anonymous or missing sessions. Every action below requires this. */
async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, error: "Missing Authorization header" };

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data.user) return { ok: false, status: 401, error: "Invalid session" };
  if (data.user.is_anonymous) return { ok: false, status: 403, error: "Admin login required" };
  return { ok: true };
}

async function exchangeCodeForTokens(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GA4_CLIENT_ID,
      client_secret: GA4_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: GA4_REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string }>;
}

async function accessTokenFromRefreshToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GA4_CLIENT_ID,
      client_secret: GA4_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function runGA4Report(accessToken: string, startDate: string, endDate: string) {
  const call = (body: unknown) =>
    fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`GA4 report failed: ${await r.text()}`);
      return r.json();
    });

  const [byEvent, byDay] = await Promise.all([
    call({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 50,
    }),
    call({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
  ]);

  const eventCounts = (byEvent.rows ?? []).map((r: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
    event: r.dimensionValues[0].value,
    count: Number(r.metricValues[0].value),
  }));
  const dailyTotals = (byDay.rows ?? []).map((r: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
    date: r.dimensionValues[0].value, // YYYYMMDD
    count: Number(r.metricValues[0].value),
  }));

  return { eventCounts, dailyTotals };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return new Response(JSON.stringify({ error: admin.error }), {
        status: admin.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, code, startDate, endDate } = await req.json();
    const supabase = serviceClient();

    if (action === "connect") {
      if (!code) throw new Error("Missing authorization code");
      const tokens = await exchangeCodeForTokens(code);
      if (!tokens.refresh_token) {
        // Google only issues a refresh token on first consent (or when
        // prompt=consent is forced) -- surfaced clearly so the frontend can
        // tell the admin to revoke app access and reconnect if this happens.
        throw new Error(
          "No refresh token returned -- revoke SongIQ's access at https://myaccount.google.com/permissions and try connecting again"
        );
      }
      const { error } = await supabase
        .from("google_oauth_tokens")
        .upsert({ id: 1, refresh_token: tokens.refresh_token, updated_at: new Date().toISOString() });
      if (error) throw error;
      return new Response(JSON.stringify({ connected: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "report") {
      const { data: tokenRow } = await supabase
        .from("google_oauth_tokens")
        .select("refresh_token")
        .eq("id", 1)
        .maybeSingle();

      if (!tokenRow) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await accessTokenFromRefreshToken(tokenRow.refresh_token);
      const { eventCounts, dailyTotals } = await runGA4Report(
        accessToken,
        startDate || "7daysAgo",
        endDate || "today"
      );

      const [{ count: streakCount }, { count: challengeCount }, { count: roomCount }, { count: activeRoomCount }] =
        await Promise.all([
          supabase.from("daily_stats").select("*", { count: "exact", head: true }),
          supabase.from("challenges").select("*", { count: "exact", head: true }),
          supabase.from("game_rooms").select("*", { count: "exact", head: true }),
          supabase.from("game_rooms").select("*", { count: "exact", head: true }).in("status", ["waiting", "playing"]),
        ]);

      return new Response(
        JSON.stringify({
          connected: true,
          eventCounts,
          dailyTotals,
          stats: {
            playersWithStreak: streakCount ?? 0,
            challengesCreated: challengeCount ?? 0,
            roomsCreated: roomCount ?? 0,
            activeRoomsNow: activeRoomCount ?? 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-analytics] Error:", err);
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
