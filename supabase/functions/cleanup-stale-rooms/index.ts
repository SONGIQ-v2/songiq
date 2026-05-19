// Scheduled cleanup of stale multiplayer rooms.
// Archives games to `game_history` (kept 14 days) before deletion.
// Triggered every 10 minutes via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
