-- Global leaderboard: playtime tracking + cross-mode Points.
--
-- Two permanent tables (game_rooms/room_players get purged by the cleanup
-- cron within ~1h of finishing, so neither can be a source of record):
--   play_sessions  — one row per completed game, any mode (minutes played)
--   player_points  — running Points totals (XP-like: start 0, only go up)
--
-- Points formula (all modes score 100-200 per correct round, max rounds*200):
--   base                = round(score / 100)          (any mode, ~0-20/game)
--   multiplayer bonus   = +5 per opponent outscored   (at room finish)
--   daily top-3 bonus   = +10 / +6 / +4               (settled after the day)

-- ---- play_sessions ----
CREATE TABLE public.play_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id UUID NOT NULL,
  player_name TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'daily', 'challenge', 'multiplayer')),
  seconds INTEGER NOT NULL CHECK (seconds BETWEEN 5 AND 3600),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX play_sessions_player_idx ON public.play_sessions (player_id);
CREATE INDEX play_sessions_created_idx ON public.play_sessions (created_at);

ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;
-- No INSERT/SELECT policies: writes go through record_game_session (below)
-- or the room-finish trigger; reads through the global_leaderboard RPC.

-- ---- player_points ----
CREATE TABLE public.player_points (
  player_id UUID NOT NULL PRIMARY KEY,
  player_name TEXT,
  points BIGINT NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.player_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view player points"
  ON public.player_points
  FOR SELECT
  TO anon, authenticated
  USING (true);
-- Writes only via the SECURITY DEFINER functions below.

-- Shared upsert helper. count_game=false for after-the-fact bonuses (daily
-- top-3) so `games` counts games, not awards.
CREATE OR REPLACE FUNCTION public.add_player_points(
  p_player_id UUID,
  p_name TEXT,
  p_points INTEGER,
  p_count_game BOOLEAN DEFAULT TRUE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO player_points (player_id, player_name, points, games, updated_at)
  VALUES (p_player_id, NULLIF(trim(coalesce(p_name, '')), ''), GREATEST(0, p_points), CASE WHEN p_count_game THEN 1 ELSE 0 END, now())
  ON CONFLICT (player_id) DO UPDATE SET
    player_name = COALESCE(NULLIF(trim(coalesce(EXCLUDED.player_name, '')), ''), player_points.player_name),
    points = player_points.points + GREATEST(0, p_points),
    games = player_points.games + CASE WHEN p_count_game THEN 1 ELSE 0 END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_points(UUID, TEXT, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ---- Solo/Daily/Challenge completions (client entry point) ----
-- Records the playtime row and awards base points, returning what was
-- earned + the new total so the results screen can show "+X points · Y".
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
  PERFORM add_player_points(v_player, p_name, v_earned, TRUE);

  RETURN QUERY
    SELECT v_earned, pp.points FROM player_points pp WHERE pp.player_id = v_player;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_game_session(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ---- Multiplayer completions (server-side, covers all 3 finish paths) ----
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
  -- A room "finished" without ever starting was never a game
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
      TRUE
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_room_points() FROM PUBLIC, anon, authenticated;

-- The status-transition guard makes this once-per-room even though "finished"
-- can be reached via advance_game_round (two branches) or the host's endGame.
CREATE TRIGGER settle_room_points_trigger
  AFTER UPDATE ON public.game_rooms
  FOR EACH ROW
  WHEN (NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished')
  EXECUTE FUNCTION public.settle_room_points();

-- ---- Daily top-3 bonus, settled once per finished day ----
ALTER TABLE public.daily_challenges ADD COLUMN points_settled_at TIMESTAMPTZ;

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
      PERFORM add_player_points(v_row.player_id, v_row.player_name, v_bonus, FALSE);
    END LOOP;

    UPDATE daily_challenges SET points_settled_at = now() WHERE challenge_date = v_date;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_daily_bonus() FROM PUBLIC, anon, authenticated;

-- ---- The leaderboard itself ----
-- Top 100 by minutes (or points), plus the caller's own row with its true
-- rank when they land outside the top 100. Windows are calendar-based in
-- Lagos time (the app's day-boundary convention): 'week' = since Sunday of
-- the current week, 'month' = since the 1st of the current month.
CREATE OR REPLACE FUNCTION public.global_leaderboard(
  p_range TEXT DEFAULT 'week',
  p_sort TEXT DEFAULT 'time',
  p_player UUID DEFAULT NULL
)
RETURNS TABLE (
  rank BIGINT,
  player_id UUID,
  player_name TEXT,
  minutes INTEGER,
  points BIGINT,
  streak INTEGER,
  is_caller BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cutoff AS (
    SELECT CASE p_range
      -- Sunday (DOW 0) of the current Lagos week, at Lagos midnight
      WHEN 'week' THEN (
        ((now() AT TIME ZONE 'Africa/Lagos')::date
          - EXTRACT(DOW FROM (now() AT TIME ZONE 'Africa/Lagos'))::int
        )::timestamp AT TIME ZONE 'Africa/Lagos'
      )
      -- 1st of the current Lagos month, at Lagos midnight
      WHEN 'month' THEN (
        date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
      )
      ELSE '-infinity'::timestamptz
    END AS ts
  ),
  playtime AS (
    SELECT
      ps.player_id,
      (array_agg(ps.player_name ORDER BY ps.created_at DESC) FILTER (WHERE ps.player_name IS NOT NULL))[1] AS player_name,
      (SUM(ps.seconds) / 60)::int AS minutes
    FROM play_sessions ps, cutoff
    WHERE ps.created_at >= cutoff.ts
    GROUP BY ps.player_id
  ),
  ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY
          CASE WHEN p_sort = 'points' THEN coalesce(pp.points, 0) ELSE pt.minutes END DESC,
          CASE WHEN p_sort = 'points' THEN pt.minutes ELSE coalesce(pp.points, 0) END DESC,
          pt.player_id
      ) AS rank,
      pt.player_id,
      coalesce(pt.player_name, pp.player_name, 'A music fan') AS player_name,
      pt.minutes,
      coalesce(pp.points, 0) AS points,
      coalesce(dsl.effective_streak, 0)::int AS streak
    FROM playtime pt
    LEFT JOIN player_points pp ON pp.player_id = pt.player_id
    LEFT JOIN daily_stats_leaderboard dsl ON dsl.player_id = pt.player_id
  )
  SELECT r.rank, r.player_id, r.player_name, r.minutes, r.points, r.streak,
         (p_player IS NOT NULL AND r.player_id = p_player) AS is_caller
  FROM ranked r
  WHERE r.rank <= 100 OR (p_player IS NOT NULL AND r.player_id = p_player)
  ORDER BY r.rank;
$$;

GRANT EXECUTE ON FUNCTION public.global_leaderboard(TEXT, TEXT, UUID) TO anon, authenticated;

-- ---- Admin dashboard: minutes played, per mode ----
CREATE OR REPLACE FUNCTION public.minutes_played_stats(p_cutoff TIMESTAMPTZ DEFAULT '-infinity')
RETURNS TABLE (mode TEXT, minutes INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ps.mode, (SUM(ps.seconds) / 60)::int AS minutes
  FROM play_sessions ps
  WHERE ps.created_at >= p_cutoff
  GROUP BY ps.mode
  ORDER BY minutes DESC;
$$;

-- Service-role only (called from the admin-analytics edge function)
REVOKE ALL ON FUNCTION public.minutes_played_stats(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
