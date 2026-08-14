-- Server-side round advancement (pg_cron safety net).
--
-- advance_game_round() has so far only ever been called from a browser tab:
-- the host calls it the instant a round's between-rounds window elapses,
-- every other room member is a delayed fallback (2.5s-6s later). That
-- covers the host's tab being throttled or gone, but if EVERY connected
-- client is stuck, backgrounded, or crashed at that moment, nothing ever
-- calls it again and the room hangs in "between_rounds" indefinitely --
-- there was previously no path back to the game that didn't depend on some
-- browser tab being alive.
--
-- This adds a pg_cron job that sweeps every "playing" room on a tight
-- interval and calls the exact same advance_game_round() function server-
-- side. It's already idempotent (row lock + status checks -- see the
-- original definition in 20260701120000_multiplayer_sync_overhaul.sql), so
-- calling it redundantly alongside the client-driven calls is always safe;
-- this is purely a backstop, not a replacement for the fast client path.

-- ----------------------------------------------------------------------------
-- 1) Let advance_game_round() be called with no auth context.
--
-- Its membership check (`auth.uid()` must be a room_players row) exists to
-- stop an arbitrary authenticated client from poking at a room they're not
-- in. A pg_cron job has no Supabase Auth session at all, so auth.uid() is
-- NULL there -- the check is only meaningful (and only enforced) when a
-- real client session is present. The cron sweep below is the only NULL-
-- auth.uid() caller in practice, since SECURITY DEFINER means nothing
-- client-facing can trigger this function without going through PostgREST
-- (which always carries a caller's auth context, real or anonymous).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_game_round(_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_round game_rounds%ROWTYPE;
  v_plan jsonb;
  v_entry jsonb;
  v_next int;
BEGIN
  -- Caller must be a member of the room -- unless there's no caller at all
  -- (the pg_cron sweep), which is trusted as a system-level caller.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM room_players
    WHERE room_id = _room_id AND player_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of this room';
  END IF;

  -- Row lock serializes concurrent advance calls from multiple clients.
  SELECT * INTO v_room FROM game_rooms WHERE id = _room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'room_not_found');
  END IF;
  IF v_room.status <> 'playing' THEN
    RETURN jsonb_build_object('status', 'not_playing');
  END IF;

  SELECT * INTO v_round FROM game_rounds
  WHERE room_id = _room_id
  ORDER BY round_number DESC
  LIMIT 1;

  IF FOUND THEN
    -- Round still running (not all-answered and not past its time limit)?
    IF v_round.ended_at IS NULL
       AND now() < v_round.started_at + make_interval(secs => COALESCE(v_room.time_per_round, 15)) THEN
      RETURN jsonb_build_object('status', 'round_active', 'round', v_round.round_number);
    END IF;

    IF v_round.ended_at IS NULL THEN
      UPDATE game_rounds SET ended_at = now() WHERE id = v_round.id;
    END IF;

    IF v_round.round_number >= v_room.total_rounds THEN
      UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE id = _room_id;
      RETURN jsonb_build_object('status', 'finished');
    END IF;

    v_next := v_round.round_number + 1;
  ELSE
    v_next := 1;
  END IF;

  SELECT plan INTO v_plan FROM room_tracks WHERE room_id = _room_id;
  v_entry := v_plan -> (v_next - 1);
  IF v_entry IS NULL THEN
    -- Plan exhausted (or missing) — finish the game rather than hang.
    UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE id = _room_id;
    RETURN jsonb_build_object('status', 'finished');
  END IF;

  -- started_at is 5s in the future: every client counts down to the same
  -- database-clock instant, so audio starts simultaneously everywhere.
  INSERT INTO game_rounds
    (room_id, round_number, track_id, track_name, artist_name,
     preview_url, options, artwork_url, question_type, started_at)
  VALUES
    (_room_id, v_next,
     v_entry->>'track_id', v_entry->>'track_name', v_entry->>'artist_name',
     v_entry->>'preview_url', v_entry->'options',
     COALESCE(v_entry->>'artwork_url', ''), v_entry->>'question_type',
     now() + interval '5 seconds')
  ON CONFLICT (room_id, round_number) DO NOTHING;

  UPDATE game_rooms SET current_round = v_next WHERE id = _room_id;

  RETURN jsonb_build_object('status', 'advanced', 'round', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_game_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_game_round(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) Sweep every playing room. Each room is advanced in its own sub-
-- transaction (BEGIN/EXCEPTION block) so one room erroring out (a data
-- anomaly, a lock timeout) can't block the rest of the sweep -- unlike a
-- flat `SELECT advance_game_round(id) FROM ...`, where any single row
-- raising would abort the whole statement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_all_playing_rounds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  FOR v_room_id IN SELECT id FROM game_rooms WHERE status = 'playing' LOOP
    BEGIN
      PERFORM advance_game_round(v_room_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'advance_all_playing_rounds: room % failed: %', v_room_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_all_playing_rounds() FROM PUBLIC, anon, authenticated;
-- No client ever calls this directly -- only the cron job below, which runs
-- as the scheduling role (postgres), not through PostgREST.

-- ----------------------------------------------------------------------------
-- 3) Schedule the sweep.
--
-- Every 3 seconds: each tick is a cheap no-op for any room with nothing due
-- yet (a row lock + early return), so there's no real cost to polling this
-- often -- and it matters, since the worst case for a room stuck on this
-- path is "however long since the last tick," not the interval itself.
--
-- Requires pg_cron 1.4+ (sub-minute schedules). If this CREATE fails on
-- your project's pg_cron version, fall back to a 1-minute schedule instead:
-- replace '3 seconds' with '* * * * *'. A 1-minute worst case is still far
-- better than "indefinitely," just far less snappy than 3s.
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'advance-stuck-multiplayer-rounds',
  '3 seconds',
  $$SELECT public.advance_all_playing_rounds();$$
);
