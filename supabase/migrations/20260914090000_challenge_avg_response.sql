-- Challenge Board redesign: bring Avg Response tracking to challenge_attempts
-- to match daily_attempts (see 20260903090000_daily_avg_response.sql). The
-- per-round timing itself is already collected client-side mode-agnostically
-- (Game.tsx's roundTimesRef/computeAvgResponseMs) -- it was just never sent
-- on the challenge submission path. Nullable, no backfill: existing rows
-- render as a dash client-side, not 0/NaN.

ALTER TABLE public.challenge_attempts ADD COLUMN IF NOT EXISTS avg_response_ms INTEGER;

DROP POLICY IF EXISTS "Players can record their own attempt" ON public.challenge_attempts;
CREATE POLICY "Players can record their own attempt"
  ON public.challenge_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND score BETWEEN 0 AND 100000
    AND correct_count BETWEEN 0 AND 30
    AND (avg_response_ms IS NULL OR avg_response_ms BETWEEN 0 AND 60000)
  );
