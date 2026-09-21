-- Bug fix: grade_player_answer() awarded full base points (100 + time
-- bonus, the bonus alone floored at 0) to ANY correct answer regardless of
-- when it was inserted -- the round's own timer only clamped the
-- time_bonus component, it never gated whether points should be awarded
-- at all. Combined with the client bug fixed alongside this migration
-- (MultiplayerGame.tsx let you click an answer option through the reveal
-- window, after the correct choice was already highlighted), a player
-- could wait for the reveal and claim a full 100 points for free -- and a
-- modified/replayed client could still do it even after the client-side
-- fix, since nothing server-side enforced it.
--
-- "Is this round still open" reuses the exact predicate already
-- established as authoritative for reveal timing in
-- 20260829090000_fix_reveal_timing_gate.sql: a round is over once
-- ended_at is set (all-answered early-end, via apply_answer_side_effects())
-- or once its own timer has elapsed (now() >= started_at + time_per_round)
-- -- evaluated against the database's own clock, never a client-reported
-- time. A short grace window (1.5s) sits on top of that boundary so an
-- honestly in-flight request -- one that left the client before the round
-- closed but is delayed by ordinary network/DB latency -- isn't zeroed
-- out by racing the boundary itself.
--
-- Late answers are still INSERTed (not rejected) and still graded for
-- is_correct. Rejecting the row outright would also break the existing
-- "record an empty answer once a round times out before this player
-- answered" path (useMultiplayerGame.ts' between_rounds effect), which
-- deliberately inserts well after the round has closed. Zeroing
-- points_earned for a late row -- rather than rejecting the insert -- is
-- the one change that closes the exploit without touching that path.

CREATE OR REPLACE FUNCTION public.grade_player_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_track text;
  r_artist text;
  r_qtype text;
  r_started timestamptz;
  r_ended timestamptz;
  r_time_per_round int;
  correct boolean;
  answer_ms bigint;
  max_ms bigint;
  time_bonus int;
  round_close timestamptz;
  is_late boolean;
BEGIN
  SELECT gr.track_name, gr.artist_name, gr.question_type, gr.started_at, gr.ended_at, rm.time_per_round
    INTO r_track, r_artist, r_qtype, r_started, r_ended, r_time_per_round
  FROM public.game_rounds gr
  JOIN public.game_rooms rm ON rm.id = gr.room_id
  WHERE gr.id = NEW.round_id;

  IF r_track IS NULL THEN
    RETURN NEW;
  END IF;

  IF r_qtype = 'song' THEN
    correct := public.normalize_quiz_answer(NEW.answer) = public.normalize_quiz_answer(r_track);
  ELSE
    correct := public.normalize_quiz_answer(NEW.answer) = public.normalize_quiz_answer(r_artist);
  END IF;

  NEW.is_correct := correct;

  max_ms := COALESCE(r_time_per_round, 15) * 1000;
  -- Same "is this round still open" boundary as the reveal-timing RLS
  -- policy in 20260829090000_fix_reveal_timing_gate.sql -- ended_at if the
  -- round closed early (all-answered), otherwise its own natural timeout,
  -- plus a small grace window so an honestly in-flight request delayed by
  -- ordinary network/DB latency isn't zeroed by racing the boundary.
  round_close := COALESCE(r_ended, r_started + make_interval(secs => COALESCE(r_time_per_round, 15)));
  is_late := now() > round_close + interval '1.5 seconds';

  IF correct AND NOT is_late THEN
    answer_ms := GREATEST(0, EXTRACT(EPOCH FROM (now() - r_started)) * 1000)::bigint;
    answer_ms := LEAST(answer_ms, max_ms);
    time_bonus := GREATEST(0, FLOOR(((max_ms - answer_ms)::numeric / max_ms) * 100))::int;
    NEW.points_earned := 100 + time_bonus;
  ELSE
    NEW.points_earned := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- Bug fix (companion, same play session): the gap between rounds was only
-- 5s, which is also the entire window the client has to prefetch the next
-- round's audio (game_rounds only gets a row for round N+1 once this
-- inserts it, a fixed offset before started_at -- see the prefetch effect
-- in useMultiplayerGame.ts). Widening it to 10s gives slower connections
-- roughly double the time to finish downloading the clip before it needs
-- to play. Client's BETWEEN_ROUNDS_TIME constant is updated to match in
-- the same commit -- these two must always agree.
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
    -- natural) before creating the next round -- see
    -- 20260830090000_advance_game_round_respects_reveal_window.sql.
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

  -- started_at is 10s in the future (was 5s): every client counts down to
  -- the same database-clock instant, so audio starts simultaneously
  -- everywhere, and everyone gets that same window to prefetch it first.
  INSERT INTO game_rounds
    (room_id, round_number, track_id, track_name, artist_name,
     preview_url, options, artwork_url, question_type, started_at)
  VALUES
    (_room_id, v_next,
     v_entry->>'track_id', v_entry->>'track_name', v_entry->>'artist_name',
     v_entry->>'preview_url', v_entry->'options',
     COALESCE(v_entry->>'artwork_url', ''), v_entry->>'question_type',
     now() + interval '10 seconds')
  ON CONFLICT (room_id, round_number) DO NOTHING;

  UPDATE game_rooms SET current_round = v_next WHERE id = _room_id;

  RETURN jsonb_build_object('status', 'advanced', 'round', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_game_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_game_round(uuid) TO authenticated;
