-- Fix: multiplayer games got permanently stuck on "Round N Complete!" and
-- never reached the results screen.
--
-- Root cause: 20260812090000_windowed_points.sql added a 5th parameter
-- (p_source) to add_player_points(). CREATE OR REPLACE FUNCTION only
-- replaces a function with the exact same parameter type list -- adding a
-- parameter creates a SECOND, separate overload instead. Both
-- add_player_points(uuid,text,integer,boolean) and
-- add_player_points(uuid,text,integer,boolean,text) have existed side by
-- side ever since. A 4-argument call is genuinely ambiguous between "the
-- true 4-arg function" and "the 5-arg function with its last parameter
-- defaulted", which Postgres/PostgREST can report as either "not unique" or
-- "function does not exist" depending on the caller -- settle_room_points()
-- (fired when a multiplayer room's last round finishes) hit exactly this,
-- so the UPDATE that marks the room "finished" never completed, and the
-- client had nothing to advance to.
--
-- Fix: drop the stale 4-arg overload, and re-assert every caller so the
-- whole call graph is verifiably consistent regardless of exactly what's
-- currently live (idempotent -- safe to run even if some of this already
-- matches).

DROP FUNCTION IF EXISTS public.add_player_points(UUID, TEXT, INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION public.add_player_points(
  p_player_id UUID,
  p_name TEXT,
  p_points INTEGER,
  p_count_game BOOLEAN DEFAULT TRUE,
  p_source TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER := GREATEST(0, p_points);
  v_target_is_anon BOOLEAN;
BEGIN
  SELECT is_anonymous INTO v_target_is_anon FROM auth.users WHERE id = p_player_id;

  INSERT INTO player_points (player_id, player_name, points, games, updated_at)
  VALUES (p_player_id, NULLIF(trim(coalesce(p_name, '')), ''), v_points, CASE WHEN p_count_game THEN 1 ELSE 0 END, now())
  ON CONFLICT (player_id) DO UPDATE SET
    player_name = CASE
      WHEN coalesce(v_target_is_anon, true)
        THEN COALESCE(NULLIF(trim(coalesce(EXCLUDED.player_name, '')), ''), player_points.player_name)
      ELSE player_points.player_name
    END,
    points = player_points.points + v_points,
    games = player_points.games + CASE WHEN p_count_game THEN 1 ELSE 0 END,
    updated_at = now();

  IF v_points > 0 THEN
    INSERT INTO points_log (player_id, points, source) VALUES (p_player_id, v_points, p_source);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_points(UUID, TEXT, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_game_session(
  p_mode TEXT,
  p_name TEXT,
  p_score INTEGER,
  p_rounds INTEGER,
  p_seconds INTEGER
)
RETURNS TABLE (points_earned INTEGER, total_points BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player UUID := auth.uid();
  v_earned INTEGER;
BEGIN
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_mode NOT IN ('solo', 'daily', 'challenge') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;
  IF p_rounds NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Invalid rounds';
  END IF;
  IF p_score NOT BETWEEN 0 AND p_rounds * 200 THEN
    RAISE EXCEPTION 'Invalid score';
  END IF;
  IF p_seconds NOT BETWEEN 5 AND 3600 THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;

  INSERT INTO play_sessions (player_id, player_name, mode, seconds)
  VALUES (v_player, NULLIF(trim(coalesce(p_name, '')), ''), p_mode, p_seconds);

  v_earned := round(p_score / 100.0)::int;
  PERFORM add_player_points(v_player, p_name, v_earned, TRUE, p_mode);

  RETURN QUERY
    SELECT v_earned, pp.points FROM player_points pp WHERE pp.player_id = v_player;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_game_session(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_room_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seconds INTEGER;
  v_row RECORD;
BEGIN
  IF NEW.started_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_seconds := CASE
    WHEN NEW.finished_at IS NULL THEN NULL
    ELSE LEAST(3600, GREATEST(5, EXTRACT(EPOCH FROM (NEW.finished_at - NEW.started_at))::int))
  END;

  FOR v_row IN
    SELECT rp.player_id, rp.player_name, rp.score,
           (SELECT count(*) FROM room_players o
             WHERE o.room_id = NEW.id AND o.score < rp.score) AS beaten
    FROM room_players rp
    WHERE rp.room_id = NEW.id
  LOOP
    IF v_seconds IS NOT NULL THEN
      INSERT INTO play_sessions (player_id, player_name, mode, seconds)
      VALUES (v_row.player_id, v_row.player_name, 'multiplayer', v_seconds);
    END IF;
    PERFORM add_player_points(
      v_row.player_id,
      v_row.player_name,
      round(v_row.score / 100.0)::int + 5 * v_row.beaten,
      TRUE,
      'multiplayer'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_room_points() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS settle_room_points_trigger ON public.game_rooms;
CREATE TRIGGER settle_room_points_trigger
  AFTER UPDATE ON public.game_rooms
  FOR EACH ROW
  WHEN (NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished')
  EXECUTE FUNCTION public.settle_room_points();

CREATE OR REPLACE FUNCTION public.settle_daily_bonus()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE;
  v_row RECORD;
  v_bonus INTEGER;
BEGIN
  FOR v_date IN
    SELECT challenge_date FROM daily_challenges
    WHERE points_settled_at IS NULL
      AND challenge_date < (now() AT TIME ZONE 'Africa/Lagos')::date
    ORDER BY challenge_date
  LOOP
    FOR v_row IN
      SELECT player_id, player_name,
             row_number() OVER (ORDER BY score DESC, created_at ASC) AS place
      FROM daily_attempts
      WHERE challenge_date = v_date
      ORDER BY score DESC, created_at ASC
      LIMIT 3
    LOOP
      v_bonus := CASE v_row.place WHEN 1 THEN 10 WHEN 2 THEN 6 ELSE 4 END;
      PERFORM add_player_points(v_row.player_id, v_row.player_name, v_bonus, FALSE, 'daily_bonus');
    END LOOP;

    UPDATE daily_challenges SET points_settled_at = now() WHERE challenge_date = v_date;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_daily_bonus() FROM PUBLIC, anon, authenticated;
