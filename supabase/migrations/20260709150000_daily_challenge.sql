-- Daily Challenge: one shared 10-round game per day (Lagos time), one attempt
-- per player, with streaks and leaderboards.

-- The day's shared game, generated server-side by the cleanup cron.
CREATE TABLE public.daily_challenges (
  challenge_date DATE NOT NULL PRIMARY KEY,
  number INTEGER NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  time_per_round INTEGER NOT NULL DEFAULT 15,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view daily challenges"
  ON public.daily_challenges
  FOR SELECT
  TO anon, authenticated
  USING (true);
-- Inserts come from the cleanup cron (service role) only.

-- One attempt per player per day; first attempt is final.
CREATE TABLE public.daily_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_date DATE NOT NULL REFERENCES public.daily_challenges(challenge_date) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name VARCHAR(50) NOT NULL DEFAULT 'A music fan',
  score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(challenge_date, player_id)
);

CREATE INDEX idx_daily_attempts_date_score ON public.daily_attempts(challenge_date, score DESC);

ALTER TABLE public.daily_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view daily attempts"
  ON public.daily_attempts
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Players can record their own daily attempt"
  ON public.daily_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND score BETWEEN 0 AND 100000
    AND correct_count BETWEEN 0 AND 30
  );

-- Per-player aggregates, maintained by trigger: streaks, totals.
CREATE TABLE public.daily_stats (
  player_id UUID NOT NULL PRIMARY KEY,
  player_name VARCHAR(50) NOT NULL DEFAULT 'A music fan',
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  total_score BIGINT NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  last_played DATE
);

CREATE INDEX idx_daily_stats_streak ON public.daily_stats(current_streak DESC, total_score DESC);

ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view daily stats"
  ON public.daily_stats
  FOR SELECT
  TO anon, authenticated
  USING (true);
-- Writes happen only via the trigger below (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.apply_daily_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev daily_stats%ROWTYPE;
  v_streak int;
BEGIN
  SELECT * INTO v_prev FROM daily_stats WHERE player_id = NEW.player_id;

  IF FOUND AND v_prev.last_played = NEW.challenge_date - 1 THEN
    v_streak := v_prev.current_streak + 1;
  ELSIF FOUND AND v_prev.last_played >= NEW.challenge_date THEN
    v_streak := v_prev.current_streak; -- defensive; unique constraint prevents replays
  ELSE
    v_streak := 1;
  END IF;

  INSERT INTO daily_stats (player_id, player_name, current_streak, best_streak, total_score, plays, last_played)
  VALUES (NEW.player_id, NEW.player_name, v_streak, v_streak, NEW.score, 1, NEW.challenge_date)
  ON CONFLICT (player_id) DO UPDATE SET
    player_name = EXCLUDED.player_name,
    current_streak = v_streak,
    best_streak = GREATEST(daily_stats.best_streak, v_streak),
    total_score = daily_stats.total_score + NEW.score,
    plays = daily_stats.plays + 1,
    last_played = NEW.challenge_date;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_daily_attempt() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS apply_daily_attempt_trigger ON public.daily_attempts;
CREATE TRIGGER apply_daily_attempt_trigger
  AFTER INSERT ON public.daily_attempts
  FOR EACH ROW EXECUTE FUNCTION public.apply_daily_attempt();
