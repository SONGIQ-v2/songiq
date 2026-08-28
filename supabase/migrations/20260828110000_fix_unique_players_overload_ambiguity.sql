-- The previous migration's CREATE OR REPLACE FUNCTION count_unique_players
-- (p_cutoff TIMESTAMPTZ DEFAULT NULL) didn't actually replace the old
-- zero-argument count_unique_players() -- different parameter lists mean
-- Postgres treats them as two separate overloads, not one function with a
-- new default. Calling it with no arguments (the all-time case) became
-- ambiguous between the two, and PostgREST silently failed that call
-- instead of picking one -- which is why "all-time" was showing 0 while
-- the date-ranged call (unambiguous, named argument) worked fine.
DROP FUNCTION IF EXISTS public.count_unique_players();

CREATE OR REPLACE FUNCTION public.count_unique_players(p_cutoff TIMESTAMPTZ DEFAULT NULL)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT player_id) FROM (
    SELECT player_id FROM daily_attempts WHERE p_cutoff IS NULL OR created_at >= p_cutoff
    UNION
    SELECT player_id FROM challenge_attempts WHERE p_cutoff IS NULL OR created_at >= p_cutoff
    UNION
    SELECT player_id FROM room_players WHERE p_cutoff IS NULL OR joined_at >= p_cutoff
    UNION
    SELECT player_id FROM play_sessions WHERE p_cutoff IS NULL OR created_at >= p_cutoff
  ) AS all_players;
$$;

REVOKE ALL ON FUNCTION public.count_unique_players(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
