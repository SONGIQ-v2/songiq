-- Daily Challenge page redesign: real "Avg Response" tracking. Per-round
-- answer time was previously computed client-side purely to score points
-- (calculatePoints() in spotify.ts) and discarded -- never sent to or
-- stored by the server. This adds a column to actually persist it.
--
-- Nullable, no backfill: rows recorded before this migration simply have no
-- avg_response_ms and render as a dash client-side, not 0/NaN.

ALTER TABLE public.daily_attempts ADD COLUMN IF NOT EXISTS avg_response_ms INTEGER;

DROP POLICY IF EXISTS "Players can record their own daily attempt" ON public.daily_attempts;
CREATE POLICY "Players can record their own daily attempt"
  ON public.daily_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND score BETWEEN 0 AND 100000
    AND correct_count BETWEEN 0 AND 30
    AND (avg_response_ms IS NULL OR avg_response_ms BETWEEN 0 AND 60000)
  );
