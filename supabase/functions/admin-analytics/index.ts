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

// Unique visitors for the selected date range -- activeUsers counts anyone
// who triggered at least one event (page_view included), which is the
// natural definition of "visitor"; no custom-event filter needed here.
async function runVisitorCount(accessToken: string, startDate: string, endDate: string): Promise<number> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "activeUsers" }],
    }),
  });
  if (!res.ok) throw new Error(`GA4 visitor-count report failed: ${await res.text()}`);
  const data = await res.json();
  return Number(data.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

// Most-visited pages (path, not just a raw total) for the selected date
// range -- same shape as runTopLocations, keyed by URL path instead of
// country/city.
async function runTopPages(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<{ path: string; views: number }[]> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
  });
  if (!res.ok) throw new Error(`GA4 top-pages report failed: ${await res.text()}`);
  const data = await res.json();
  return (data.rows ?? []).map((r: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
    path: r.dimensionValues[0].value || "/",
    views: Number(r.metricValues[0].value),
  }));
}

// GA4's session-level bounceRate (fraction of sessions with no engagement)
// for the selected date range -- same shape as runVisitorCount, just a
// different metric, no dimension needed since we want one aggregate number.
async function runBounceRate(accessToken: string, startDate: string, endDate: string): Promise<number> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "bounceRate" }],
    }),
  });
  if (!res.ok) throw new Error(`GA4 bounce-rate report failed: ${await res.text()}`);
  const data = await res.json();
  return Number(data.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

// Top countries/cities by unique visitor for the selected date range.
async function runTopLocations(
  accessToken: string,
  dimension: "country" | "city",
  startDate: string,
  endDate: string
): Promise<{ name: string; visitors: number }[]> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimension }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 10,
    }),
  });
  if (!res.ok) throw new Error(`GA4 ${dimension} report failed: ${await res.text()}`);
  const data = await res.json();
  return (data.rows ?? []).map((r: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
    name: r.dimensionValues[0].value || "(not set)",
    visitors: Number(r.metricValues[0].value),
  }));
}

// Traffic sources (Direct, Organic Search, Referral, Social, etc.) --
// GA4's own default channel grouping, keyed by sessions rather than users
// since a channel is a property of how a visit arrived, not the visitor.
async function runTrafficSources(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<{ source: string; sessions: number }[]> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
  });
  if (!res.ok) throw new Error(`GA4 traffic-sources report failed: ${await res.text()}`);
  const data = await res.json();
  return (data.rows ?? []).map((r: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
    source: r.dimensionValues[0].value || "(not set)",
    sessions: Number(r.metricValues[0].value),
  }));
}

// Lifetime count of a single GA4 event, queried with a fixed wide range
// rather than the selected date range -- aggregated GA4 report data (unlike
// user-level data) isn't subject to the property's retention window. Used
// for events with no DB table of their own (solo games) and for events
// whose DB counterpart is unreliable as an all-time proxy (challenge
// completions -- challenge_attempts only ever holds one row per player per
// challenge, so a replay doesn't re-count there the way it does in GA4).
async function runEventCountAllTime(accessToken: string, eventName: string): Promise<number> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "2020-01-01", endDate: "today" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", stringFilter: { value: eventName } },
      },
    }),
  });
  if (!res.ok) throw new Error(`GA4 all-time event-count report failed for "${eventName}": ${await res.text()}`);
  const data = await res.json();
  return Number(data.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

// Real (non-anonymous) signed-in players -- name/email come from Google via
// Supabase Auth's admin API (client-side/anon keys can never list auth.users;
// this requires the service-role client). Anonymous players vastly
// outnumber real ones, so this pages through admin.listUsers() rather than
// assuming signed-in users are all on the first page, capped to bound cost.
async function fetchSignedInUsers(
  supabase: ReturnType<typeof serviceClient>
): Promise<{ id: string; name: string | null; nickname: string | null; email: string | null; createdAt: string; lastSignInAt: string | null; points: number }[]> {
  const signedIn: { id: string; name: string | null; email: string | null; createdAt: string; lastSignInAt: string | null }[] = [];
  const maxPages = 20; // 20 * 200 = up to 4000 users scanned
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("[admin-analytics] listUsers failed:", error.message);
      break;
    }
    for (const u of data.users) {
      if (u.is_anonymous) continue;
      const meta = u.user_metadata as Record<string, unknown> | null;
      signedIn.push({
        id: u.id,
        name: (meta?.full_name ?? meta?.name ?? null) as string | null,
        email: u.email ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < 200) break; // last page
    if (signedIn.length >= 200) break; // enough for the dashboard
  }

  if (signedIn.length === 0) return [];
  const { data: pointsRows } = await supabase
    .from("player_points")
    .select("player_id, player_name, points")
    .in("player_id", signedIn.map((u) => u.id));
  const pointsById = new Map(
    (pointsRows ?? []).map((r: { player_id: string; player_name: string | null; points: number }) => [r.player_id, r])
  );

  return signedIn
    .map((u) => ({
      ...u,
      nickname: pointsById.get(u.id)?.player_name ?? null,
      points: Number(pointsById.get(u.id)?.points ?? 0),
    }))
    .sort((a, b) => b.points - a.points);
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

    const { action, code, redirectUri, startDate, endDate, rangeKey, playerId, nickname } = await req.json();
    const supabase = serviceClient();

    if (action === "search_players") {
      if (!nickname || !nickname.trim()) throw new Error("Missing nickname");

      const { data: rows, error: searchErr } = await supabase
        .from("player_points")
        .select("player_id, player_name, points")
        .ilike("player_name", `%${nickname.trim()}%`)
        .order("points", { ascending: false })
        .limit(50);
      if (searchErr) throw searchErr;

      return new Response(
        JSON.stringify({
          players: (rows ?? []).map((r) => ({ playerId: r.player_id, playerName: r.player_name, points: r.points })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "player_profile") {
      if (!playerId) throw new Error("Missing playerId");

      const [
        { data: pointsRow },
        { count: soloCount },
        { count: dailyCount },
        { count: challengeCount },
        { data: mpStatsRows },
        { data: streakRow },
        { data: sessionRows },
      ] = await Promise.all([
        supabase.from("player_points").select("player_name, points, games").eq("player_id", playerId).maybeSingle(),
        supabase.from("play_sessions").select("*", { count: "exact", head: true }).eq("player_id", playerId).eq("mode", "solo"),
        supabase.from("daily_attempts").select("*", { count: "exact", head: true }).eq("player_id", playerId),
        supabase.from("challenge_attempts").select("*", { count: "exact", head: true }).eq("player_id", playerId),
        supabase.rpc("get_multiplayer_profile_stats", { p_player_id: playerId }),
        supabase.from("daily_stats").select("current_streak, best_streak").eq("player_id", playerId).maybeSingle(),
        supabase.from("play_sessions").select("seconds").eq("player_id", playerId),
      ]);

      const mp = (mpStatsRows as { rooms_played: number; avg_position: number | null; win_rate_pct: number }[] | null)?.[0];
      const minutesPlayed = Math.round(
        (sessionRows ?? []).reduce((sum: number, r: { seconds: number }) => sum + (r.seconds ?? 0), 0) / 60
      );

      return new Response(
        JSON.stringify({
          playerId,
          playerName: pointsRow?.player_name ?? null,
          points: pointsRow?.points ?? 0,
          gamesPlayed: pointsRow?.games ?? 0,
          soloGamesPlayed: soloCount ?? 0,
          dailyChallengesPlayed: dailyCount ?? 0,
          challengesPlayed: challengeCount ?? 0,
          minutesPlayed,
          currentStreak: streakRow?.current_streak ?? 0,
          bestStreak: streakRow?.best_streak ?? 0,
          roomsPlayed: mp?.rooms_played ?? 0,
          avgPosition: mp?.avg_position ?? null,
          winRatePct: mp?.win_rate_pct ?? 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      const [
        { eventCounts, dailyTotals },
        topPlaylists,
        soloGamesPlayedAllTime,
        challengesCompletedAllTime,
        visitorsInRange,
        bounceRate,
        bounceRateAllTime,
        topPages,
        topCountries,
        topCities,
        trafficSources,
        signedInUsers,
      ] = await Promise.all([
        runGA4Report(accessToken, reportStart, reportEnd),
        runTopPlaylists(accessToken, reportStart, reportEnd).catch((e) => {
          // Missing/unregistered custom dimension shouldn't break the rest
          // of the dashboard -- just comes back empty.
          console.error("[admin-analytics] Top playlists failed:", e);
          return [];
        }),
        runEventCountAllTime(accessToken, "solo_game_complete").catch((e) => {
          console.error("[admin-analytics] Solo games all-time failed:", e);
          return 0;
        }),
        runEventCountAllTime(accessToken, "challenge_complete").catch((e) => {
          console.error("[admin-analytics] Challenges completed all-time failed:", e);
          return 0;
        }),
        runVisitorCount(accessToken, reportStart, reportEnd).catch((e) => {
          console.error("[admin-analytics] Visitor count failed:", e);
          return 0;
        }),
        runBounceRate(accessToken, reportStart, reportEnd).catch((e) => {
          console.error("[admin-analytics] Bounce rate failed:", e);
          return 0;
        }),
        // Same fixed wide range as runSoloGamesAllTime -- aggregated GA4
        // report data isn't subject to the property's retention window.
        runBounceRate(accessToken, "2020-01-01", "today").catch((e) => {
          console.error("[admin-analytics] Bounce rate (all-time) failed:", e);
          return 0;
        }),
        runTopPages(accessToken, reportStart, reportEnd).catch((e) => {
          console.error("[admin-analytics] Top pages failed:", e);
          return [];
        }),
        runTopLocations(accessToken, "country", reportStart, reportEnd).catch((e) => {
          console.error("[admin-analytics] Top countries failed:", e);
          return [];
        }),
        runTopLocations(accessToken, "city", reportStart, reportEnd).catch((e) => {
          console.error("[admin-analytics] Top cities failed:", e);
          return [];
        }),
        runTrafficSources(accessToken, reportStart, reportEnd).catch((e) => {
          console.error("[admin-analytics] Traffic sources failed:", e);
          return [];
        }),
        fetchSignedInUsers(supabase).catch((e) => {
          console.error("[admin-analytics] Signed-in users failed:", e);
          return [];
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
        { count: roomCount },
        { count: roomCountInRange },
        { count: activeRoomCount },
        { count: dailyPlaysToday },
        { data: dailyScoresToday },
        { data: topStreakRow },
        { data: uniquePlayersInRange },
        { data: uniquePlayersAllTime },
        { data: minutesByModeInRange },
        { data: minutesByModeAllTime },
        { data: roomArchiveRows },
      ] = await Promise.all([
        supabase.from("daily_stats").select("*", { count: "exact", head: true }),
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
        supabase.rpc("count_unique_players", { p_cutoff: rangeCutoff }),
        supabase.rpc("count_unique_players"),
        supabase.rpc("minutes_played_stats", { p_cutoff: rangeCutoff }),
        supabase.rpc("minutes_played_stats"),
        supabase
          .from("room_archive")
          .select("room_code, host_name, category, created_at, room_player_archive(player_name, joined_at)")
          .gte("created_at", rangeCutoff)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const sumMinutes = (rows: { mode: string; minutes: number }[] | null) =>
        (rows ?? []).reduce((sum, r) => sum + (r.minutes ?? 0), 0);
      const minutesPlayedInRange = sumMinutes(minutesByModeInRange);
      const minutesPlayedAllTime = sumMinutes(minutesByModeAllTime);

      const dailyAvgScoreToday =
        dailyScoresToday && dailyScoresToday.length > 0
          ? Math.round(dailyScoresToday.reduce((sum: number, r: { score: number }) => sum + r.score, 0) / dailyScoresToday.length)
          : 0;

      // Solo games aren't recorded server-side at all (no table -- only
      // Daily/Challenge attempts are) -- GA4's solo_game_complete count,
      // already scoped to the selected range, is the only source for this.
      const soloGamesPlayedInRange = eventCounts.find((e: { event: string }) => e.event === "solo_game_complete")?.count ?? 0;
      // "Challenges created" (creation_log) counts every silently pre-generated
      // share link, most of which are never actually shared -- challenge_complete
      // only fires when someone genuinely plays through (or explicitly quits) a
      // challenge link, which is what this stat is meant to represent.
      const challengesCompletedInRange = eventCounts.find((e: { event: string }) => e.event === "challenge_complete")?.count ?? 0;

      const rooms = (roomArchiveRows ?? []).map((r: {
        room_code: string;
        host_name: string;
        category: string;
        created_at: string;
        room_player_archive: { player_name: string; joined_at: string }[];
      }) => ({
        room_code: r.room_code,
        host_name: r.host_name,
        category: r.category,
        created_at: r.created_at,
        players: r.room_player_archive ?? [],
      }));

      return new Response(
        JSON.stringify({
          connected: true,
          eventCounts,
          dailyTotals,
          topPlaylists,
          topCountries,
          topCities,
          topPages,
          trafficSources,
          signedInUsers,
          rooms,
          stats: {
            playersWithStreak: streakCount ?? 0,
            challengesCompletedInRange,
            challengesCompletedAllTime,
            roomsCreated: roomCount ?? 0,
            roomsCreatedInRange: roomCountInRange ?? 0,
            soloGamesPlayedInRange,
            soloGamesPlayedAllTime,
            visitorsInRange,
            bounceRatePct: Math.round(bounceRate * 1000) / 10,
            bounceRatePctAllTime: Math.round(bounceRateAllTime * 1000) / 10,
            minutesPlayedInRange,
            minutesPlayedAllTime,
            minutesByMode: minutesByModeInRange ?? [],
            activeRoomsNow: activeRoomCount ?? 0,
            dailyPlaysToday: dailyPlaysToday ?? 0,
            dailyAvgScoreToday,
            topStreakPlayer: topStreakRow
              ? { name: topStreakRow.player_name, streak: topStreakRow.effective_streak }
              : null,
            uniquePlayersInRange: (uniquePlayersInRange as number | null) ?? 0,
            uniquePlayersEver: (uniquePlayersAllTime as number | null) ?? 0,
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
