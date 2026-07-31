-- The Streaks leaderboard sorted by the raw daily_stats.current_streak
-- column, which is only ever updated when a player submits a new attempt —
-- there's no job that resets it when someone stops playing. A player who
-- had a 30-day streak and quit stays frozen at 30 in the DB forever, so
-- they could still rank near the top while the UI (correctly) shows "0"
-- for them, making the visible order look wrong. This view computes an
-- honest effective_streak (0 once the streak has actually lapsed) so
-- ranking and the displayed number always agree.
CREATE OR REPLACE VIEW public.daily_stats_leaderboard
WITH (security_invoker = true) AS
SELECT
  player_id,
  player_name,
  current_streak,
  best_streak,
  total_score,
  plays,
  last_played,
  CASE
    WHEN last_played >= (now() AT TIME ZONE 'Africa/Lagos')::date - 1
    THEN current_streak
    ELSE 0
  END AS effective_streak
FROM public.daily_stats;

GRANT SELECT ON public.daily_stats_leaderboard TO anon, authenticated;
