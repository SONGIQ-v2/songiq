// Scheduled cleanup of stale multiplayer rooms.
// Triggered every 10 minutes via pg_cron (see migration).
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

    // 1) waiting rooms older than 2h (never started)
    const { data: waitingRooms } = await supabase
      .from("game_rooms")
      .select("id")
      .eq("status", "waiting")
      .lt("created_at", waitingCutoff);

    // 2) finished rooms older than 1h
    const { data: finishedRooms } = await supabase
      .from("game_rooms")
      .select("id")
      .eq("status", "finished")
      .lt("finished_at", finishedCutoff);

    // 3) playing rooms whose latest round started >15 min ago (abandoned)
    const { data: playingRooms } = await supabase
      .from("game_rooms")
      .select("id, started_at")
      .eq("status", "playing");

    const stalePlayingIds: string[] = [];
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
        stalePlayingIds.push(room.id);
      } else if (!lastActivity && room.started_at && room.started_at < playingCutoff) {
        stalePlayingIds.push(room.id);
      }
    }

    const allRoomIds = [
      ...(waitingRooms ?? []).map((r) => r.id),
      ...(finishedRooms ?? []).map((r) => r.id),
      ...stalePlayingIds,
    ];

    if (allRoomIds.length === 0) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete children first (no FKs in schema)
    await supabase.from("player_answers").delete().in("room_id", allRoomIds);
    await supabase.from("game_rounds").delete().in("room_id", allRoomIds);
    await supabase.from("room_players").delete().in("room_id", allRoomIds);
    const { error: roomsErr } = await supabase.from("game_rooms").delete().in("id", allRoomIds);
    if (roomsErr) throw roomsErr;

    console.log(`[cleanup-stale-rooms] Deleted ${allRoomIds.length} rooms`, {
      waiting: waitingRooms?.length ?? 0,
      finished: finishedRooms?.length ?? 0,
      playing: stalePlayingIds.length,
    });

    return new Response(
      JSON.stringify({
        deleted: allRoomIds.length,
        breakdown: {
          waiting: waitingRooms?.length ?? 0,
          finished: finishedRooms?.length ?? 0,
          playing_abandoned: stalePlayingIds.length,
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
