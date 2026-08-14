-- Challenge leaderboard: one recorded attempt per player per challenge link.

CREATE TABLE public.challenge_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_code VARCHAR(8) NOT NULL REFERENCES public.challenges(code) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name VARCHAR(50) NOT NULL DEFAULT 'A music fan',
  score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- First attempt counts; the database refuses replays even from modified clients
  UNIQUE(challenge_code, player_id)
);

CREATE INDEX idx_challenge_attempts_code ON public.challenge_attempts(challenge_code);

ALTER TABLE public.challenge_attempts ENABLE ROW LEVEL SECURITY;

-- The leaderboard is public to anyone with the link
CREATE POLICY "Anyone can view challenge attempts"
  ON public.challenge_attempts
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Players may only record their own attempt, with sane bounds
CREATE POLICY "Players can record their own attempt"
  ON public.challenge_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND score BETWEEN 0 AND 100000
    AND correct_count BETWEEN 0 AND 30
  );

-- No UPDATE/DELETE: first attempt is final.
