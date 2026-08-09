-- Fix: leaderboard Points didn't respect the Weekly/Monthly/All-time filter.
--
-- global_leaderboard() windowed minutes played correctly (play_sessions has
-- a created_at per row), but points came straight from player_points, which
-- is only ever a running lifetime total with no timestamp -- so switching
-- tabs re-ranked by minutes but left the Points column unchanged. This adds
-- a timestamped ledger behind the existing total so windowed sums work,
-- without changing what the lifetime total (header chip, "all" tab) shows.

CREATE TABLE public.points_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id UUID NOT NULL,
  points INTEGER NOT NULL,
  source TEXT, -- 'solo' | 'daily' | 'challenge' | 'multiplayer' | 'daily_bonus' | 'backfill'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX points_log_player_idx ON public.points_log (player_id);
CREATE INDEX points_log_created_idx ON public.points_log (created_at);

ALTER TABLE public.points_log ENABLE ROW LEVEL SECURITY;
-- No policies -- same as play_sessions: writes only via add_player_points(),
-- reads only via global_leaderboard().

-- Backfill existing totals, dated in the past so they land in "all time"
-- only -- the exact historical timing of pre-migration points isn't known,
-- and treating them as "not earned this week/month" is the safe default.
INSERT INTO public.points_log (player_id, points, source, created_at)
SELECT player_id, points, 'backfill', '2020-01-01'::timestamptz
FROM public.player_points
WHERE points > 0;

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
BEGIN
  INSERT INTO player_points (player_id, player_name, points, games, updated_at)
  VALUES (p_player_id, NULLIF(trim(coalesce(p_name, '')), ''), v_points, CASE WHEN p_count_game THEN 1 ELSE 0 END, now())
  ON CONFLICT (player_id) DO UPDATE SET
    player_name = COALESCE(NULLIF(trim(coalesce(EXCLUDED.player_name, '')), ''), player_points.player_name),
    points = player_points.points + v_points,
    games = player_points.games + CASE WHEN p_count_game THEN 1 ELSE 0 END,
    updated_at = now();

  IF v_points > 0 THEN
    INSERT INTO points_log (player_id, points, source) VALUES (p_player_id, v_points, p_source);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_points(UUID, TEXT, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

-- Give the three existing callers a source label (cosmetic/debugging only;
-- functionally unchanged otherwise).
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

-- Points now sum from the timestamped ledger over the same window used for
-- minutes, instead of the lifetime total -- everything else (rank tie-break,
-- top-100 + caller's-own-row shape) is unchanged.
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
      WHEN 'week' THEN (
        ((now() AT TIME ZONE 'Africa/Lagos')::date
          - EXTRACT(DOW FROM (now() AT TIME ZONE 'Africa/Lagos'))::int
        )::timestamp AT TIME ZONE 'Africa/Lagos'
      )
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
  windowed_points AS (
    SELECT pl.player_id, SUM(pl.points)::bigint AS points
    FROM points_log pl, cutoff
    WHERE pl.created_at >= cutoff.ts
    GROUP BY pl.player_id
  ),
  ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY
          CASE WHEN p_sort = 'points' THEN coalesce(wp.points, 0) ELSE pt.minutes END DESC,
          CASE WHEN p_sort = 'points' THEN pt.minutes ELSE coalesce(wp.points, 0) END DESC,
          pt.player_id
      ) AS rank,
      pt.player_id,
      coalesce(pt.player_name, pp.player_name, 'A music fan') AS player_name,
      pt.minutes,
      coalesce(wp.points, 0) AS points,
      coalesce(dsl.effective_streak, 0)::int AS streak
    FROM playtime pt
    LEFT JOIN windowed_points wp ON wp.player_id = pt.player_id
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
