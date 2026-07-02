-- Track who created a challenge so their own link shows the leaderboard
-- instead of a play button.

ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS creator_id UUID;

DROP POLICY IF EXISTS "Players can create challenges" ON public.challenges;
CREATE POLICY "Players can create challenges"
  ON public.challenges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    jsonb_typeof(plan) = 'array'
    AND jsonb_array_length(plan) BETWEEN 1 AND 30
    AND creator_score BETWEEN 0 AND 100000
    AND time_per_round BETWEEN 5 AND 120
    AND (creator_id IS NULL OR creator_id = auth.uid())
  );
