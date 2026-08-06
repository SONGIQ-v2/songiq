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

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  // redirect_uri here must exactly match what the frontend sent Google in
  // the initial auth request -- it varies (localhost while testing,
  // songiq.io in production), so it's passed through per-request rather
  // than fixed as a secret.
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GA4_CLIENT_ID,
      client_secret: GA4_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
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

// Every event trackEvent() actually fires (src/lib/analytics.ts call sites).
// GA4 also auto-collects its own events (page_view, session_start, click,
// scroll, first_visit, etc.) alongside these -- this list is how the
// dashboard shows only what SongIQ deliberately tracks, not Google's noise.
const CUSTOM_EVENT_NAMES = [
  "solo_game_start",
  "solo_game_complete",
  "daily_challenge_start",
  "daily_challenge_complete",
  "challenge_accept",
  "challenge_create",
  "challenge_complete",
  "multiplayer_room_create",
  "multiplayer_room_join",
  "multiplayer_game_start",
  "multiplayer_game_complete",
  "room_link_copy",
  "share_result",
  "push_subscribe",
];

const customEventsFilter = {
  filter: {
    fieldName: "eventName",
    inListFilter: { values: CUSTOM_EVENT_NAMES },
  },
};

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
      dimensionFilter: customEventsFilter,
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 50,
    }),
    call({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: customEventsFilter,
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

// playlist_name is only sent on these two events (src/pages/SoloPlay.tsx,
// RoomLobby.tsx) -- requires the customEvent:playlist_name dimension to
// already be registered in GA4 Admin -> Custom Definitions, or this comes
// back empty.
async function runTopPlaylists(accessToken: string, startDate: string, endDate: string) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "customEvent:playlist_name" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: ["solo_game_start", "multiplayer_game_start"] },
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 10,
    }),
  });
  if (!res.ok) throw new Error(`GA4 top-playlists report failed: ${await res.text()}`);
  const data = await res.json();
  return (data.rows ?? []).map((r: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
    playlist: r.dimensionValues[0].value || "(not set)",
    plays: Number(r.metricValues[0].value),
  }));
}

// Solo games have no DB table (only Daily/Challenge attempts do), so GA4 is
// the only source, even for "all-time" -- queried with a fixed wide range
// rather than the selected date range, since aggregated GA4 report data
// (unlike user-level data) isn't subject to the property's retention window.
async function runSoloGamesAllTime(accessToken: string): Promise<number> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "2020-01-01", endDate: "today" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", stringFilter: { value: "solo_game_complete" } },
      },
    }),
  });
  if (!res.ok) throw new Error(`GA4 solo-games-all-time report failed: ${await res.text()}`);
  const data = await res.json();
  return Number(data.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

/** "Today" by Lagos time, matching daily_challenges.challenge_date elsewhere in the app. */
function lagosToday(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** created_at cutoff matching the dashboard's date-range selector. */
function rangeCutoffISO(rangeKey: string | undefined): string {
  if (rangeKey === "today") {
    // Midnight Lagos time, same day boundary as lagosToday().
    const lagosMidnight = new Date(`${lagosToday()}T00:00:00+01:00`);
    return lagosMidnight.toISOString();
  }
  const days = rangeKey === "30d" ? 30 : 7; // default: 7d
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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

    const { action, code, redirectUri, startDate, endDate, rangeKey } = await req.json();
    const supabase = serviceClient();

    if (action === "connect") {
      if (!code) throw new Error("Missing authorization code");
      if (!redirectUri) throw new Error("Missing redirectUri");
      const tokens = await exchangeCodeForTokens(code, redirectUri);
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

      let accessToken: string;
      try {
        accessToken = await accessTokenFromRefreshToken(tokenRow.refresh_token);
      } catch (e) {
        // A stored refresh token can go bad (Testing-mode 7-day expiry,
        // scope changed since it was issued, access revoked, etc.) --
        // treated the same as never having connected, so the frontend
        // always has a "Connect" button to fall back to instead of a
        // dead-end error.
        console.error("[admin-analytics] Stored refresh token is invalid:", e);
        return new Response(JSON.stringify({ connected: false, reason: "token_expired" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const reportStart = startDate || "7daysAgo";
      const reportEnd = endDate || "today";
      const [{ eventCounts, dailyTotals }, topPlaylists, soloGamesPlayedAllTime] = await Promise.all([
        runGA4Report(accessToken, reportStart, reportEnd),
        runTopPlaylists(accessToken, reportStart, reportEnd).catch((e) => {
          // Missing/unregistered custom dimension shouldn't break the rest
          // of the dashboard -- just comes back empty.
          console.error("[admin-analytics] Top playlists failed:", e);
          return [];
        }),
        runSoloGamesAllTime(accessToken).catch((e) => {
          console.error("[admin-analytics] Solo games all-time failed:", e);
          return 0;
        }),
      ]);

      const today = lagosToday();
      const rangeCutoff = rangeCutoffISO(rangeKey);
      // game_rooms/challenges get purged by cleanup-stale-rooms (rooms within
      // 2h/1h/15m, challenges after 30 days) -- a plain COUNT(*) on either,
      // with or without a date filter, only ever reflects whatever hasn't
      // been purged yet. creation_log is a permanent, insert-only record of
      // every creation, so every count below (all-time and in-range) reads
      // from it instead.
      const [
        { count: streakCount },
        { count: challengeCount },
        { count: challengeCountInRange },
        { count: challengeAttemptCount },
        { count: roomCount },
        { count: roomCountInRange },
        { count: activeRoomCount },
        { count: dailyPlaysToday },
        { data: dailyScoresToday },
        { data: topStreakRow },
        { data: uniquePlayers },
      ] = await Promise.all([
        supabase.from("daily_stats").select("*", { count: "exact", head: true }),
        supabase.from("creation_log").select("*", { count: "exact", head: true }).eq("event_type", "challenge"),
        supabase.from("creation_log").select("*", { count: "exact", head: true }).eq("event_type", "challenge").gte("created_at", rangeCutoff),
        supabase.from("challenge_attempts").select("*", { count: "exact", head: true }),
        supabase.from("creation_log").select("*", { count: "exact", head: true }).eq("event_type", "room"),
        supabase.from("creation_log").select("*", { count: "exact", head: true }).eq("event_type", "room").gte("created_at", rangeCutoff),
        supabase.from("game_rooms").select("*", { count: "exact", head: true }).in("status", ["waiting", "playing"]),
        supabase.from("daily_attempts").select("*", { count: "exact", head: true }).eq("challenge_date", today),
        supabase.from("daily_attempts").select("score").eq("challenge_date", today),
        supabase
          .from("daily_stats_leaderboard")
          .select("player_name, effective_streak")
          .order("effective_streak", { ascending: false })
          .order("total_score", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.rpc("count_unique_players"),
      ]);

      const dailyAvgScoreToday =
        dailyScoresToday && dailyScoresToday.length > 0
          ? Math.round(dailyScoresToday.reduce((sum: number, r: { score: number }) => sum + r.score, 0) / dailyScoresToday.length)
          : 0;

      // Solo games aren't recorded server-side at all (no table -- only
      // Daily/Challenge attempts are) -- GA4's solo_game_complete count,
      // already scoped to the selected range, is the only source for this.
      const soloGamesPlayedInRange = eventCounts.find((e: { event: string }) => e.event === "solo_game_complete")?.count ?? 0;

      return new Response(
        JSON.stringify({
          connected: true,
          eventCounts,
          dailyTotals,
          topPlaylists,
          stats: {
            playersWithStreak: streakCount ?? 0,
            challengesCreated: challengeCount ?? 0,
            challengesCreatedInRange: challengeCountInRange ?? 0,
            roomsCreated: roomCount ?? 0,
            roomsCreatedInRange: roomCountInRange ?? 0,
            soloGamesPlayedInRange,
            soloGamesPlayedAllTime,
            activeRoomsNow: activeRoomCount ?? 0,
            dailyPlaysToday: dailyPlaysToday ?? 0,
            dailyAvgScoreToday,
            topStreakPlayer: topStreakRow
              ? { name: topStreakRow.player_name, streak: topStreakRow.effective_streak }
              : null,
            uniquePlayersEver: (uniquePlayers as number | null) ?? 0,
            challengeCompletionRatePct:
              challengeCount && challengeCount > 0
                ? Math.round(((challengeAttemptCount ?? 0) / challengeCount) * 100)
                : 0,
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
