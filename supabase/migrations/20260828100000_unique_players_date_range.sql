-- Let count_unique_players() scope to a date range (matching the dashboard's
-- Today/7d/30d selector), same p_cutoff pattern as minutes_played_stats().
-- p_cutoff defaults to NULL so the existing all-time call (no argument)
-- keeps working unchanged.
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
