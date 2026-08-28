-- Lifetime per-player multiplayer outcomes, for a future player profile page
-- (rooms played, average position, win rate). room_players.score -- the only
-- per-game outcome data that exists today -- is deleted with its room by
-- cleanup-stale-rooms within 15min-2h, and settle_room_points() already
-- computes each player's "beaten" count to size their points bonus, then
-- discards it. This captures that same computation permanently instead.
--
-- Scope: only rooms that reach a clean status='finished' transition count --
-- abandoned (timed-out) rooms already earn zero points today under this
-- exact same trigger condition, so keeping these stats scoped identically
-- avoids "0 points but it still counts as a loss."
CREATE TABLE public.multiplayer_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id UUID NOT NULL,
  player_id UUID NOT NULL,
  player_name VARCHAR(50) NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  won BOOLEAN NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  UNIQUE(room_id, player_id)
);
CREATE INDEX multiplayer_results_player_id_idx ON public.multiplayer_results (player_id);

ALTER TABLE public.multiplayer_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players can view their own multiplayer results"
  ON public.multiplayer_results FOR SELECT TO authenticated
  USING (player_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.multiplayer_results FROM PUBLIC, anon, authenticated;

-- Enriches the existing room-finish settlement (same trigger, same event --
-- settle_room_points_trigger on game_rooms needs no changes) instead of
-- adding a second trigger that recomputes the same per-room standings.
-- rank = 1 + count of players with a strictly higher score (ties share a
-- rank), mirroring the tie-handling already implicit in the existing
-- `beaten` calculation just below it (strict <, no special-casing).
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
             WHERE o.room_id = NEW.id AND o.score < rp.score) AS beaten,
           (SELECT count(*) FROM room_players o
             WHERE o.room_id = NEW.id AND o.score > rp.score) AS beaten_by,
           (SELECT count(*) FROM room_players o
             WHERE o.room_id = NEW.id) AS player_count
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
    INSERT INTO multiplayer_results (room_id, player_id, player_name, score, rank, player_count, won, finished_at)
    VALUES (
      NEW.id, v_row.player_id, v_row.player_name, v_row.score,
      v_row.beaten_by + 1, v_row.player_count, v_row.beaten_by = 0, NEW.finished_at
    )
    ON CONFLICT (room_id, player_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_room_points() FROM PUBLIC, anon, authenticated;

-- multiplayer_results must follow a player from their anonymous ID to their
-- signed-in one, same as points_log/play_sessions just above it -- otherwise
-- anyone who plays multiplayer anonymously and later signs in would
-- permanently lose that history from their profile. (challenge_attempts/
-- room_players have this same gap and were left as-is by user choice --
-- multiplayer_results must not repeat it, since it's the table this profile
-- feature depends on.) Append-only, same as points_log/play_sessions: a
-- room+player_id pair can only ever have been written under one identity at
-- the time it was created, so reassigning player_id can't collide with the
-- UNIQUE(room_id, player_id) constraint.
CREATE OR REPLACE FUNCTION public.merge_player_data(v_old UUID, v_new UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_points player_points%ROWTYPE;
BEGIN
  -- Append-only ledgers -- no conflicts possible, just reassign.
  UPDATE points_log SET player_id = v_new WHERE player_id = v_old;
  UPDATE play_sessions SET player_id = v_new WHERE player_id = v_old;
  UPDATE multiplayer_results SET player_id = v_new WHERE player_id = v_old;

  -- Lifetime totals: sum in, preferring the anonymous player's own chosen
  -- nickname (the one they actually played under) over whatever's already
  -- on the destination account.
  SELECT * INTO v_old_points FROM player_points WHERE player_id = v_old;
  IF FOUND THEN
    INSERT INTO player_points (player_id, player_name, points, games, updated_at)
    VALUES (v_new, v_old_points.player_name, v_old_points.points, v_old_points.games, now())
    ON CONFLICT (player_id) DO UPDATE SET
      player_name = COALESCE(v_old_points.player_name, player_points.player_name),
      points = player_points.points + v_old_points.points,
      games = player_points.games + v_old_points.games,
      updated_at = now();
    DELETE FROM player_points WHERE player_id = v_old;
  END IF;

  -- Daily attempts: one per day is already enforced app-wide, so a same-day
  -- collision means the destination's own attempt wins -- move everything
  -- else, drop what's left unmerged.
  UPDATE daily_attempts SET player_id = v_new
  WHERE player_id = v_old
    AND challenge_date NOT IN (
      SELECT challenge_date FROM daily_attempts WHERE player_id = v_new
    );
  DELETE FROM daily_attempts WHERE player_id = v_old;

  PERFORM public.recompute_daily_stats(v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_player_data(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- One-time backfill from game_history (up to 14 days of players JSONB
-- snapshots for reason='finished' rooms) -- a warm start instead of zero,
-- same spirit as creation_log's existing backfill-on-migration precedent.
INSERT INTO public.multiplayer_results (room_id, player_id, player_name, score, rank, player_count, won, finished_at)
SELECT
  gh.room_id,
  (p->>'player_id')::uuid,
  p->>'player_name',
  (p->>'score')::int,
  1 + (SELECT count(*) FROM jsonb_array_elements(gh.players) o WHERE (o->>'score')::int > (p->>'score')::int),
  jsonb_array_length(gh.players),
  (SELECT count(*) FROM jsonb_array_elements(gh.players) o WHERE (o->>'score')::int > (p->>'score')::int) = 0,
  gh.finished_at
FROM public.game_history gh, jsonb_array_elements(gh.players) p
WHERE gh.reason = 'finished' AND gh.finished_at IS NOT NULL
ON CONFLICT (room_id, player_id) DO NOTHING;

-- Convenience aggregate for the future profile page.
CREATE OR REPLACE FUNCTION public.get_multiplayer_profile_stats(p_player_id UUID)
RETURNS TABLE (rooms_played BIGINT, avg_position NUMERIC, win_rate_pct NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*),
    round(avg(rank), 1),
    round(100.0 * count(*) FILTER (WHERE won) / GREATEST(count(*), 1), 1)
  FROM multiplayer_results WHERE player_id = p_player_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_multiplayer_profile_stats(UUID) TO authenticated;
