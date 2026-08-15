-- Fix: the pg_cron safety net (advance_all_playing_rounds, added in
-- 20260821090000_server_side_round_advancement.sql) calls advance_game_round()
-- every 3 seconds with zero awareness of the 3s reveal window
-- (REVEAL_MS in useMultiplayerGame.ts) -- that delay has only ever existed
-- as a client-side convention: the normal client-driven call is gated on
-- gameStatus === "between_rounds", which itself only becomes true *after*
-- the reveal window has elapsed. advance_game_round() itself has never
-- known about the reveal window at all -- it sets ended_at and creates the
-- next round in the very same call, with no delay.
--
-- That was harmless while only clients called it (they naturally wait out
-- the reveal before calling), but the cron has no such courtesy -- it can
-- create the next round within moments of this one ending, cutting the
-- reveal screen off before anyone sees it. Most visible on a natural
-- timeout (nothing ends the round early, so the cron's own 3s tick cycle
-- races directly against the reveal window); the early-end case (everyone
-- answers) mostly avoided it by timing luck, not because it was actually safe.
--
-- Fix belongs in the function itself, not the caller, so it's correct
-- regardless of who calls it: after ended_at is set (early or natural),
-- wait out the same 3s reveal window before creating the next round.
-- Callers that hit this too early (the cron, mainly) just get back a
-- 'revealing' status and retry on their next cycle -- for the cron that's
-- automatic (a bare PERFORM, doesn't inspect the response); for a normal
-- client call it's a non-error response, harmless either way since the
-- cron's own retry is now the backstop for the rare case a client's own
-- timing was slightly ahead of the server's.

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
      v_round.ended_at := now();
    END IF;

    -- Reveal window: give clients 3s after the round ended (early or
    -- natural) before creating the next round -- see migration header.
    IF now() < v_round.ended_at + interval '3 seconds' THEN
      RETURN jsonb_build_object('status', 'revealing', 'round', v_round.round_number);
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
