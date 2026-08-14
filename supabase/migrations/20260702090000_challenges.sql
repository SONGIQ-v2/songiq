-- Challenge links: a finished game's round plan snapshotted so anyone with
-- the link can replay the exact same songs/options and try to beat the score.

CREATE TABLE public.challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(8) NOT NULL UNIQUE,
  creator_name VARCHAR(50) NOT NULL DEFAULT 'A music fan',
  creator_score INTEGER NOT NULL DEFAULT 0,
  category_name VARCHAR(100) NOT NULL DEFAULT 'Music Quiz',
  time_per_round INTEGER NOT NULL DEFAULT 15,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_challenges_created_at ON public.challenges(created_at);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- Anyone with the code can load a challenge (codes are unguessable enough
-- for casual bragging; the data is quiz rounds, nothing sensitive).
CREATE POLICY "Anyone can view challenges"
  ON public.challenges
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Any signed-in (incl. anonymous) player can create one, with sane bounds.
CREATE POLICY "Players can create challenges"
  ON public.challenges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    jsonb_typeof(plan) = 'array'
    AND jsonb_array_length(plan) BETWEEN 1 AND 30
    AND creator_score BETWEEN 0 AND 100000
    AND time_per_round BETWEEN 5 AND 120
  );

-- No client UPDATE/DELETE; stale challenges are purged by the cleanup job.
