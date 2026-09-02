-- count_unique_players() undercounted: it only looked at daily_attempts,
-- challenge_attempts, and room_players -- so anyone who has only ever
-- played Solo (the lowest-friction mode, no signup/room-code required)
-- was never counted at all. play_sessions records every mode, including
-- solo, so it's the missing branch.
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
    UNION
    SELECT player_id FROM play_sessions
  ) AS all_players;
$$;
