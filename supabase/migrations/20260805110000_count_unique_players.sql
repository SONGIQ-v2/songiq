-- Rough proxy for "total unique players ever" -- a UNION DISTINCT across the
-- three tables that record a player_id, which the query-builder API can't
-- express directly. Used by the /anonymous admin dashboard.
CREATE OR REPLACE FUNCTION public.count_unique_players()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT player_id) FROM (
    SELECT player_id FROM daily_attempts
    UNION
    SELECT player_id FROM challenge_attempts
    UNION
    SELECT player_id FROM room_players
  ) AS all_players;
$$;

REVOKE ALL ON FUNCTION public.count_unique_players() FROM PUBLIC, anon, authenticated;
