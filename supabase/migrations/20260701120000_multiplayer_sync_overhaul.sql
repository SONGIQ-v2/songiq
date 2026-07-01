-- ============================================================================
-- Multiplayer sync overhaul
--
-- 1. room_tracks: the host stores the full round plan (tracks + options) at
--    game start, so round creation no longer depends on the host's browser.
-- 2. advance_game_round(): server-side round advancement. Any room member can
--    call it; it is idempotent (serialized via row lock + unique constraint)
--    and uses the DATABASE clock for started_at, with a 5s pre-round gap.
-- 3. apply_answer_side_effects(): after an answer is graded, the server
--    updates the player's score (removes the client read-modify-write race)
--    and ends the round early when everyone has answered.
-- 4. Broadcast-from-database: replaces postgres_changes fan-out. One trigger
--    per game table broadcasts to topic room:<room_id>; clients subscribe to
--    a single private Broadcast channel. postgres_changes RLS-per-event
--    checks scale O(events x subscribers) and drop events under load, which
--    caused desyncs in rooms with 4+ players.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Round plan storage
-- ----------------------------------------------------------------------------
CREATE TABLE public.room_tracks (
  room_id UUID NOT NULL PRIMARY KEY REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.room_tracks ENABLE ROW LEVEL SECURITY;

-- Only the host may read/write the plan (it contains every round's answers).
-- advance_game_round() reads it as SECURITY DEFINER, bypassing RLS.
CREATE POLICY "Host manages room track plan"
  ON public.room_tracks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE game_rooms.id = room_tracks.room_id
        AND game_rooms.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE game_rooms.id = room_tracks.room_id
        AND game_rooms.host_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 2) Server-side round advancement
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
  -- Caller must be a member of the room.
  IF NOT EXISTS (
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
-- 3) Server-side score update + all-answered round end
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_answer_side_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players int;
  v_answers int;
BEGIN
  -- Score is applied here, atomically, instead of by the client
  -- (the old client-side read-then-write raced under concurrency).
  IF NEW.points_earned > 0 THEN
    UPDATE room_players
    SET score = score + NEW.points_earned
    WHERE room_id = NEW.room_id AND player_id = NEW.player_id;
  END IF;

  -- End the round early once every current room member has answered.
  SELECT count(*) INTO v_players FROM room_players WHERE room_id = NEW.room_id;
  SELECT count(*) INTO v_answers FROM player_answers WHERE round_id = NEW.round_id;
  IF v_answers >= v_players THEN
    UPDATE game_rounds SET ended_at = now()
    WHERE id = NEW.round_id AND ended_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_answer_side_effects() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS apply_answer_side_effects_trigger ON public.player_answers;
CREATE TRIGGER apply_answer_side_effects_trigger
  AFTER INSERT ON public.player_answers
  FOR EACH ROW EXECUTE FUNCTION public.apply_answer_side_effects();

-- ----------------------------------------------------------------------------
-- 4) Broadcast-from-database (replaces postgres_changes on the client)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_room_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'game_rooms' THEN
      v_room_id := OLD.id;
    ELSE
      v_room_id := OLD.room_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'game_rooms' THEN
      v_room_id := NEW.id;
    ELSE
      v_room_id := NEW.room_id;
    END IF;
  END IF;

  PERFORM realtime.broadcast_changes(
    'room:' || v_room_id::text, -- topic
    TG_OP,                      -- event
    TG_OP,                      -- operation
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_room_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS broadcast_game_rooms_trigger ON public.game_rooms;
CREATE TRIGGER broadcast_game_rooms_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.game_rooms
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_room_change();

DROP TRIGGER IF EXISTS broadcast_room_players_trigger ON public.room_players;
CREATE TRIGGER broadcast_room_players_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_room_change();

DROP TRIGGER IF EXISTS broadcast_game_rounds_trigger ON public.game_rounds;
CREATE TRIGGER broadcast_game_rounds_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.game_rounds
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_room_change();

DROP TRIGGER IF EXISTS broadcast_player_answers_trigger ON public.player_answers;
CREATE TRIGGER broadcast_player_answers_trigger
  AFTER INSERT ON public.player_answers
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_room_change();

-- Authorize room members to receive broadcasts on room:* topics.
-- Room UUIDs are unguessable, and all of this data was already readable via
-- the tables' SELECT policies, so topic-level gating is sufficient here.
DROP POLICY IF EXISTS "Room members can receive room broadcasts" ON realtime.messages;
CREATE POLICY "Room members can receive room broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'room:%'
    AND realtime.messages.extension = 'broadcast'
  );
