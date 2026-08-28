// Scheduled cleanup of stale multiplayer rooms.
// Archives games to `game_history` (kept 14 days) before deletion.
// Triggered every 10 minutes via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";
import { fetchPlaylistPool, buildRoundPlanFromPool, DAILY_EXCLUDED } from "../_shared/itunes.ts";

// Whether a playlist is a single-artist spotlight (forces "Guess the Song"
// only in buildRoundPlanFromPool -- "Guess the Artist" makes no sense for a
// playlist about one artist) now comes straight from playlist_cache.is_artist,
// populated by the client from playlists.ts's isArtist flag on every cache
// write -- see the "eligible" filter below, not a hand-maintained list here.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const waitingCutoff = new Date(now - 2 * 60 * 60 * 1000).toISOString();    // 2h
    const finishedCutoff = new Date(now - 60 * 60 * 1000).toISOString();        // 1h
    const playingCutoff = new Date(now - 15 * 60 * 1000).toISOString();         // 15m
    const historyCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(); // 14d

    // Purge history older than 14 days
    const { count: purgedHistory } = await supabase
      .from("game_history")
      .delete({ count: "exact" })
      .lt("archived_at", historyCutoff);

    // Purge client logs older than 14 days
    const { count: purgedLogs } = await supabase
      .from("client_logs")
      .delete({ count: "exact" })
      .lt("created_at", historyCutoff);

    // Purge challenge links older than 30 days
    const challengeCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: purgedChallenges } = await supabase
      .from("challenges")
      .delete({ count: "exact" })
      .lt("created_at", challengeCutoff);
    console.log(`Purged ${purgedChallenges ?? 0} expired challenges`);

    // Purge the admin Multiplayer tab's room/player archive after 30 days
    // (room_player_archive rows cascade off room_archive, no separate delete needed)
    const { count: purgedRoomArchive } = await supabase
      .from("room_archive")
      .delete({ count: "exact" })
      .lt("created_at", challengeCutoff);
    console.log(`Purged ${purgedRoomArchive ?? 0} expired room archive entries`);

    // Award the daily top-3 Points bonus for any finished, unsettled day
    // (idempotent; no-op when every past day is already settled)
    const { error: bonusErr } = await supabase.rpc("settle_daily_bonus");
    if (bonusErr) console.error("[cleanup-stale-rooms] Daily bonus settle failed:", bonusErr.message);

    // Refresh stale playlist pools (>24h) so new releases show up daily.
    // Runs here because this function is already on a 10-minute cron with the
    // service role — no separate scheduler or key handling needed. Capped per
    // run to keep invocations fast; a full refresh completes across a few runs.
    const playlistCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { data: stalePlaylists } = await supabase
      .from("playlist_cache")
      .select("playlist_name, search_terms")
      .lt("updated_at", playlistCutoff)
      .order("updated_at", { ascending: true })
      .limit(6);

    let refreshedPlaylists = 0;
    for (const row of stalePlaylists ?? []) {
      try {
        const terms = Array.isArray(row.search_terms) ? row.search_terms : [];
        if (terms.length === 0) continue;
        const { pool, image } = await fetchPlaylistPool(terms, 50);
        if (pool.length < 20) continue; // throttled/failed fetch — keep the old pool
        await supabase.from("playlist_cache").upsert({
          playlist_name: row.playlist_name,
          search_terms: terms,
          tracks: pool,
          image_url: image,
          updated_at: new Date().toISOString(),
        });
        refreshedPlaylists++;
      } catch (e) {
        console.error(`[cleanup-stale-rooms] Playlist refresh failed for ${row.playlist_name}:`, e);
      }
    }
    if (refreshedPlaylists > 0) {
      console.log(`[cleanup-stale-rooms] Refreshed ${refreshedPlaylists} playlist pools`);
    }

    // Generate today's Daily Challenge (day boundary = Lagos, UTC+1) if it
    // doesn't exist yet: pick a random cached playlist and snapshot 10 rounds.
    const lagosToday = new Date(now + 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: existingDaily } = await supabase
      .from("daily_challenges")
      .select("challenge_date")
      .eq("challenge_date", lagosToday)
      .maybeSingle();

    if (!existingDaily) {
      const { data: pools } = await supabase
        .from("playlist_cache")
        .select("playlist_name, tracks, is_artist");

      const eligible = (pools ?? []).filter(
        (p) =>
          !DAILY_EXCLUDED.has(p.playlist_name) &&
          Array.isArray(p.tracks) &&
          p.tracks.length >= 20
      );

      if (eligible.length > 0) {
        const pick = eligible[Math.floor(Math.random() * eligible.length)];
        const plan = buildRoundPlanFromPool(pick.tracks, 10, Boolean(pick.is_artist));
        const { count: dailyCount } = await supabase
          .from("daily_challenges")
          .select("*", { count: "exact", head: true });

        const { error: dailyErr } = await supabase.from("daily_challenges").insert({
          challenge_date: lagosToday,
          number: (dailyCount ?? 0) + 1,
          category_name: pick.playlist_name,
          time_per_round: 15,
          plan,
        });
        if (dailyErr) {
          console.error("[cleanup-stale-rooms] Daily challenge insert failed:", dailyErr.message);
        } else {
          console.log(`[cleanup-stale-rooms] Generated daily #${(dailyCount ?? 0) + 1} (${pick.playlist_name})`);
        }
      } else {
        console.log("[cleanup-stale-rooms] No eligible playlist pools for daily challenge yet");
      }
    }

    // Ensure a VAPID keypair exists on EVERY run — subscriptions need the
    // public key immediately, only the sending waits for the evening.
    let { data: vapid } = await supabase
      .from("push_vapid")
      .select("public_key, private_key")
      .eq("id", 1)
      .maybeSingle();
    if (!vapid) {
      const keys = webpush.generateVAPIDKeys();
      const { data: inserted, error: vapidErr } = await supabase
        .from("push_vapid")
        .insert({ id: 1, public_key: keys.publicKey, private_key: keys.privateKey })
        .select("public_key, private_key")
        .single();
      if (!vapidErr) vapid = inserted;
      else console.error("[cleanup-stale-rooms] VAPID insert failed:", vapidErr.message);
    }

    // ---- Daily reminder push: two slots per day (Lagos time) ----
    //   am: from 10:00 — "today's challenge is live"
    //   pm: from 22:00 — "2 hours left" urgency (streak-aware)
    const lagosHour = new Date(now + 60 * 60 * 1000).getUTCHours();
    const slot = lagosHour >= 22 ? "pm" : lagosHour >= 10 ? "am" : null;
    const slotKey = slot ? `${lagosToday}:${slot}` : null;

    if (slotKey) {
      const { data: subs } = vapid
        ? await supabase
            .from("push_subscriptions")
            .select("*")
            .or(`last_notified_slot.is.null,last_notified_slot.neq.${slotKey}`)
            .limit(200)
        : { data: null };

      if (vapid && subs && subs.length > 0) {
        webpush.setVapidDetails("mailto:hello@songiq.io", vapid.public_key, vapid.private_key);

        const { data: todayChallenge } = await supabase
          .from("daily_challenges")
          .select("number, category_name")
          .eq("challenge_date", lagosToday)
          .maybeSingle();

        const { data: playedRows } = await supabase
          .from("daily_attempts")
          .select("player_id")
          .eq("challenge_date", lagosToday);
        const played = new Set((playedRows ?? []).map((r) => r.player_id));

        const playerIds = [...new Set(subs.map((s) => s.player_id))];
        const { data: statsRows } = await supabase
          .from("daily_stats")
          .select("player_id, current_streak, last_played")
          .in("player_id", playerIds);
        const statsById = new Map((statsRows ?? []).map((s) => [s.player_id, s]));
        const lagosYesterday = new Date(now + 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        let sent = 0;
        let pruned = 0;
        for (const sub of subs) {
          // Mark first so failures never retry-spam the same person
          await supabase
            .from("push_subscriptions")
            .update({ last_notified_slot: slotKey })
            .eq("id", sub.id);

          if (!todayChallenge || played.has(sub.player_id)) continue;

          const stats = statsById.get(sub.player_id);
          const streakAtRisk =
            stats && stats.last_played === lagosYesterday ? stats.current_streak : 0;

          const payload = JSON.stringify(
            slot === "pm"
              ? streakAtRisk > 1
                ? {
                    title: `🔥 ${streakAtRisk}-day streak — 2 hours left!`,
                    body: `Daily #${todayChallenge.number} (${todayChallenge.category_name}) ends at midnight. Keep it alive!`,
                    url: "/daily",
                  }
                : {
                    title: `⏰ 2 hours left for Daily #${todayChallenge.number}`,
                    body: `${todayChallenge.category_name} — ends at midnight. One attempt!`,
                    url: "/daily",
                  }
              : {
                  title: `🎵 Daily Challenge #${todayChallenge.number} is live`,
                  body: `${todayChallenge.category_name} — same 10 songs for everyone. One attempt!`,
                  url: "/daily",
                }
          );

          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              {
                // High urgency wakes dozing Android devices instead of
                // batching; TTL stops stale reminders arriving after the
                // window has passed (pm expires at midnight).
                urgency: "high",
                TTL: slot === "pm" ? 2 * 60 * 60 : 12 * 60 * 60,
              }
            );
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number })?.statusCode;
            if (status === 404 || status === 410) {
              // Subscription expired/revoked — prune it
              await supabase.from("push_subscriptions").delete().eq("id", sub.id);
              pruned++;
            } else {
              console.error("[cleanup-stale-rooms] Push send failed:", status);
            }
          }
        }
        if (sent > 0 || pruned > 0) {
          console.log(`[cleanup-stale-rooms] Push reminders: sent ${sent}, pruned ${pruned}`);
        }
      }
    }

    // 1) waiting rooms older than 2h (never started) — not archived (no gameplay data)
    const { data: waitingRooms } = await supabase
      .from("game_rooms")
      .select("id")
      .eq("status", "waiting")
      .lt("created_at", waitingCutoff);

    // 2) finished rooms older than 1h — archive
    const { data: finishedRooms } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("status", "finished")
      .lt("finished_at", finishedCutoff);

    // 3) playing rooms whose latest round started >15 min ago (abandoned) — archive
    const { data: playingRooms } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("status", "playing");

    const stalePlayingRooms: any[] = [];
    for (const room of playingRooms ?? []) {
      const { data: latestRound } = await supabase
        .from("game_rounds")
        .select("started_at")
        .eq("room_id", room.id)
        .order("round_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastActivity = latestRound?.started_at ?? room.started_at;
      if (lastActivity && lastActivity < playingCutoff) {
        stalePlayingRooms.push(room);
      } else if (!lastActivity && room.started_at && room.started_at < playingCutoff) {
        stalePlayingRooms.push(room);
      }
    }

    // Archive finished + abandoned playing rooms
    const roomsToArchive = [
      ...(finishedRooms ?? []).map((r) => ({ room: r, reason: "finished" as const })),
      ...stalePlayingRooms.map((r) => ({ room: r, reason: "abandoned" as const })),
    ];

    for (const { room, reason } of roomsToArchive) {
      const [{ data: players }, { data: rounds }, { data: answers }] = await Promise.all([
        supabase.from("room_players").select("*").eq("room_id", room.id),
        supabase.from("game_rounds").select("*").eq("room_id", room.id).order("round_number"),
        supabase.from("player_answers").select("*").eq("room_id", room.id),
      ]);

      await supabase.from("game_history").insert({
        room_id: room.id,
        room_code: room.room_code,
        host_id: room.host_id,
        host_name: room.host_name,
        category: room.category,
        status: room.status,
        total_rounds: room.total_rounds,
        rounds_played: room.current_round,
        time_per_round: room.time_per_round,
        created_at: room.created_at,
        started_at: room.started_at,
        finished_at: room.finished_at,
        players: players ?? [],
        rounds: rounds ?? [],
        answers: answers ?? [],
        reason,
      });
    }

    const allRoomIds = [
      ...(waitingRooms ?? []).map((r) => r.id),
      ...(finishedRooms ?? []).map((r) => r.id),
      ...stalePlayingRooms.map((r) => r.id),
    ];

    if (allRoomIds.length === 0) {
      console.log(`[cleanup-stale-rooms] No rooms to delete. Purged ${purgedHistory ?? 0} history records.`);
      return new Response(JSON.stringify({ deleted: 0, archived: roomsToArchive.length, purged_history: purgedHistory ?? 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete children first (no FKs in schema)
    await supabase.from("player_answers").delete().in("room_id", allRoomIds);
    await supabase.from("game_rounds").delete().in("room_id", allRoomIds);
    await supabase.from("room_players").delete().in("room_id", allRoomIds);
    const { error: roomsErr } = await supabase.from("game_rooms").delete().in("id", allRoomIds);
    if (roomsErr) throw roomsErr;

    console.log(`[cleanup-stale-rooms] Deleted ${allRoomIds.length} rooms, archived ${roomsToArchive.length}, purged ${purgedHistory ?? 0} history`, {
      waiting: waitingRooms?.length ?? 0,
      finished: finishedRooms?.length ?? 0,
      playing_abandoned: stalePlayingRooms.length,
    });

    return new Response(
      JSON.stringify({
        deleted: allRoomIds.length,
        archived: roomsToArchive.length,
        purged_history: purgedHistory ?? 0,
        breakdown: {
          waiting: waitingRooms?.length ?? 0,
          finished: finishedRooms?.length ?? 0,
          playing_abandoned: stalePlayingRooms.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cleanup-stale-rooms] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
