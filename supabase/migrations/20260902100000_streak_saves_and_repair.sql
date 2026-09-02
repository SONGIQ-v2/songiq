-- Daily streak retention: "Streak Save" insurance + a referral-based repair
-- window for when no Save is available. See the approved retention plan for
-- the full design; this migration implements the backend half of it.
--
-- Two independent mechanics, both keyed off the existing daily_stats row
-- (current_streak/last_played are never proactively reset -- only
-- apply_daily_attempt() touches them, on a player's next actual submission --
-- so neither mechanic needs a scheduled "detect the break" job; both are
-- computed live from dates whenever they're read):
--
-- 1. Streak Saves: earned automatically every 15 consecutive days played,
--    capped at 2 held, each expiring 15 days after it's earned. Consumed
--    silently inside apply_daily_attempt() when a player returns after
--    exactly a single missed day.
--
-- 2. Repair window: when a player returns after 2+ missed days (too long
--    for a Save to cover), get_streak_protection_status() reports an
--    escalating referral bar (3/5/7 distinct friends on days 1-3, then 2
--    and 3 distinct qualifying Challenge links on days 4-5). Clearing a
--    day's bar fires restore_streak_via_repair() (a trigger on
--    challenge_attempts) the moment a qualifying attempt lands -- not
--    waiting for the player to touch Daily Challenge again.

-- ============================================================
-- Streak Saves
-- ============================================================

CREATE TABLE public.streak_saves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL,
  earned_at DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'milestone_15day',
  used_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_streak_saves_player_unused ON public.streak_saves(player_id) WHERE used_at IS NULL;

ALTER TABLE public.streak_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their own streak saves"
  ON public.streak_saves
  FOR SELECT
  TO authenticated
  USING (auth.uid() = player_id);
-- Writes happen only via apply_daily_attempt() (SECURITY DEFINER) below.

REVOKE INSERT, UPDATE, DELETE ON public.streak_saves FROM anon, authenticated;

-- ============================================================
-- apply_daily_attempt(): Save-aware streak update
-- ============================================================
-- Same consecutive-day rule as before, with one addition: a gap of exactly
-- one missed day is now covered by an unused, unexpired Save if the player
-- holds one -- the streak continues as if they hadn't missed a day, and the
-- Save is marked used. A gap of two or more days is unaffected (Saves only
-- ever bridge a single missed day) and falls through to the existing reset,
-- leaving the repair window (below) as the only path back.
--
-- Earning: every 15th consecutive day played awards a new Save, capped at 2
-- held at once (earning is skipped while already at the cap).

CREATE OR REPLACE FUNCTION public.apply_daily_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev daily_stats%ROWTYPE;
  v_streak int;
  v_save_id UUID;
  v_saves_held INT;
BEGIN
  SELECT * INTO v_prev FROM daily_stats WHERE player_id = NEW.player_id;

  IF FOUND AND v_prev.last_played = NEW.challenge_date - 1 THEN
    v_streak := v_prev.current_streak + 1;
  ELSIF FOUND AND v_prev.last_played = NEW.challenge_date - 2 THEN
    -- Exactly one day missed -- covered by the oldest unexpired Save, if any.
    SELECT id INTO v_save_id
    FROM streak_saves
    WHERE player_id = NEW.player_id
      AND used_at IS NULL
      AND earned_at >= NEW.challenge_date - 15
    ORDER BY earned_at ASC
    LIMIT 1;

    IF v_save_id IS NOT NULL THEN
      UPDATE streak_saves SET used_at = NEW.challenge_date WHERE id = v_save_id;
      v_streak := v_prev.current_streak + 1;
    ELSE
      v_streak := 1;
    END IF;
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

  -- Earn a Save every 15 consecutive days, capped at 2 held.
  IF v_streak > 0 AND v_streak % 15 = 0 THEN
    SELECT count(*) INTO v_saves_held
    FROM streak_saves
    WHERE player_id = NEW.player_id AND used_at IS NULL AND earned_at >= NEW.challenge_date - 15;

    IF v_saves_held < 2 THEN
      INSERT INTO streak_saves (player_id, earned_at, source)
      VALUES (NEW.player_id, NEW.challenge_date, 'milestone_15day');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- recompute_daily_stats(): Save-aware replay (merge safety)
-- ============================================================
-- Anonymous-to-signed-in merges rebuild daily_stats by replaying history
-- from scratch (see merge_player_data()) -- without the same Save logic
-- here, a merge could silently undo a Save-preserved streak the moment the
-- player signs in. Saves are earned/consumed in the same chronological pass
-- as the streak itself, so the two stay in lockstep with what
-- apply_daily_attempt() would have produced play-by-play.

CREATE OR REPLACE FUNCTION public.recompute_daily_stats(p_player_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_prev_date DATE;
  v_streak INT := 0;
  v_best INT := 0;
  v_total BIGINT := 0;
  v_plays INT := 0;
  v_name TEXT;
  v_last DATE;
  v_save_id UUID;
  v_saves_held INT;
BEGIN
  DELETE FROM daily_stats WHERE player_id = p_player_id;
  DELETE FROM streak_saves WHERE player_id = p_player_id;

  FOR v_row IN
    SELECT * FROM daily_attempts WHERE player_id = p_player_id ORDER BY challenge_date ASC
  LOOP
    IF v_prev_date IS NOT NULL AND v_row.challenge_date = v_prev_date + 1 THEN
      v_streak := v_streak + 1;
    ELSIF v_prev_date IS NOT NULL AND v_row.challenge_date = v_prev_date + 2 THEN
      SELECT id INTO v_save_id
      FROM streak_saves
      WHERE player_id = p_player_id
        AND used_at IS NULL
        AND earned_at >= v_row.challenge_date - 15
      ORDER BY earned_at ASC
      LIMIT 1;

      IF v_save_id IS NOT NULL THEN
        UPDATE streak_saves SET used_at = v_row.challenge_date WHERE id = v_save_id;
        v_streak := v_streak + 1;
      ELSE
        v_streak := 1;
      END IF;
    ELSE
      v_streak := 1;
    END IF;

    v_best := GREATEST(v_best, v_streak);
    v_total := v_total + v_row.score;
    v_plays := v_plays + 1;
    v_name := v_row.player_name;
    v_last := v_row.challenge_date;
    v_prev_date := v_row.challenge_date;

    IF v_streak > 0 AND v_streak % 15 = 0 THEN
      SELECT count(*) INTO v_saves_held
      FROM streak_saves
      WHERE player_id = p_player_id AND used_at IS NULL AND earned_at >= v_row.challenge_date - 15;

      IF v_saves_held < 2 THEN
        INSERT INTO streak_saves (player_id, earned_at, source)
        VALUES (p_player_id, v_row.challenge_date, 'milestone_15day');
      END IF;
    END IF;
  END LOOP;

  IF v_plays > 0 THEN
    INSERT INTO daily_stats (player_id, player_name, current_streak, best_streak, total_score, plays, last_played)
    VALUES (p_player_id, v_name, v_streak, v_best, v_total, v_plays, v_last);
  END IF;
END;
$$;

-- ============================================================
-- Repair window: read status + restore-on-referral trigger
-- ============================================================

-- Everything the frontend needs to render streak status in one call: the
-- raw streak/Save numbers, plus a computed status the client doesn't have
-- to re-derive:
--   'active'  -- played today
--   'at_risk' -- active streak, hasn't played today yet (gap <= 1 day)
--   'save_available_today' -- exactly one day missed, a Save would cover it
--                              if they play today
--   'repair'  -- two+ days missed, no Save can help; referral window open
--   'lost'    -- repair window (5 days) has closed without being cleared
--   'none'    -- no streak to protect (current_streak < 2, or no history)
CREATE OR REPLACE FUNCTION public.get_streak_protection_status()
RETURNS TABLE (
  current_streak INT,
  last_played DATE,
  saves_available INT,
  next_save_expires DATE,
  status TEXT,
  repair_day_number INT,
  repair_target_friends INT,
  repair_progress_friends INT,
  repair_target_challenges INT,
  repair_progress_challenges INT,
  repair_deadline TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats daily_stats%ROWTYPE;
  v_today DATE := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_gap INT;
  v_saves_available INT;
  v_next_expiry DATE;
  v_day_number INT;
  v_status TEXT;
  v_target_friends INT;
  v_progress_friends INT;
  v_target_challenges INT;
  v_progress_challenges INT;
  v_deadline TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_stats FROM daily_stats WHERE player_id = auth.uid();

  IF NOT FOUND OR v_stats.current_streak < 2 THEN
    RETURN QUERY SELECT
      COALESCE(v_stats.current_streak, 0), v_stats.last_played,
      0, NULL::DATE, 'none'::TEXT, NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  v_gap := v_today - v_stats.last_played;

  SELECT count(*), max(earned_at) + 15 INTO v_saves_available, v_next_expiry
  FROM streak_saves
  WHERE player_id = auth.uid() AND used_at IS NULL AND earned_at >= v_today - 15;

  IF v_gap <= 1 THEN
    v_status := CASE WHEN v_gap = 0 THEN 'active' ELSE 'at_risk' END;
  ELSIF v_gap = 2 AND v_saves_available > 0 THEN
    v_status := 'save_available_today';
  ELSE
    -- gap=2 (no save) -> day 1, gap=3 -> day 2, ... gap=6 -> day 5 (final)
    v_day_number := v_gap - 1;
    IF v_day_number BETWEEN 1 AND 5 THEN
      v_status := 'repair';
      -- Midnight Lagos on (last_played + 7) -- the instant day 5 closes.
      v_deadline := ((v_stats.last_played + 7)::timestamp AT TIME ZONE 'Africa/Lagos');

      IF v_day_number <= 3 THEN
        v_target_friends := CASE v_day_number WHEN 1 THEN 3 WHEN 2 THEN 5 ELSE 7 END;
        SELECT count(DISTINCT ca.player_id) INTO v_progress_friends
        FROM challenge_attempts ca
        JOIN challenges c ON c.code = ca.challenge_code
        WHERE c.creator_id = auth.uid()
          AND c.created_at >= ((v_stats.last_played + 2)::timestamp AT TIME ZONE 'Africa/Lagos')
          AND ca.player_id != auth.uid();
        v_progress_friends := COALESCE(v_progress_friends, 0);
      ELSE
        v_target_challenges := CASE v_day_number WHEN 4 THEN 2 ELSE 3 END;
        SELECT count(*) INTO v_progress_challenges FROM (
          SELECT c.code
          FROM challenges c
          JOIN challenge_attempts ca ON ca.challenge_code = c.code AND ca.player_id != c.creator_id
          WHERE c.creator_id = auth.uid()
            AND c.created_at >= ((v_stats.last_played + 2)::timestamp AT TIME ZONE 'Africa/Lagos')
          GROUP BY c.code
          HAVING count(DISTINCT ca.player_id) >= 5
        ) qualifying;
        v_progress_challenges := COALESCE(v_progress_challenges, 0);
      END IF;
    ELSE
      v_status := 'lost';
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_stats.current_streak, v_stats.last_played,
    v_saves_available, v_next_expiry,
    v_status, v_day_number,
    v_target_friends, v_progress_friends,
    v_target_challenges, v_progress_challenges,
    v_deadline;
END;
$$;

REVOKE ALL ON FUNCTION public.get_streak_protection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_streak_protection_status() TO authenticated;

-- Fires on every Challenge-link completion; restores the creator's streak
-- the moment their cumulative referral progress clears the current day's
-- bar (see get_streak_protection_status() for the same day-number/target
-- logic -- kept in sync since both read the same tables). A no-op for the
-- vast majority of attempts (creator not in an active repair window).
CREATE OR REPLACE FUNCTION public.restore_streak_via_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_stats daily_stats%ROWTYPE;
  v_today DATE := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_gap INT;
  v_day_number INT;
  v_progress_friends INT;
  v_progress_challenges INT;
  v_cleared BOOLEAN := false;
BEGIN
  SELECT creator_id INTO v_creator_id
  FROM challenges WHERE code = NEW.challenge_code;

  IF v_creator_id IS NULL OR v_creator_id = NEW.player_id THEN
    RETURN NEW; -- no creator on record, or the creator playing their own link
  END IF;

  SELECT * INTO v_stats FROM daily_stats WHERE player_id = v_creator_id;
  IF NOT FOUND OR v_stats.current_streak < 2 THEN
    RETURN NEW;
  END IF;

  v_gap := v_today - v_stats.last_played;
  -- gap=2 (no save) -> day 1, gap=3 -> day 2, ... gap=6 -> day 5 (final)
  v_day_number := v_gap - 1;
  IF v_day_number < 1 OR v_day_number > 5 THEN
    RETURN NEW; -- not in an active repair window
  END IF;

  IF v_day_number <= 3 THEN
    SELECT count(DISTINCT ca.player_id) INTO v_progress_friends
    FROM challenge_attempts ca
    JOIN challenges c ON c.code = ca.challenge_code
    WHERE c.creator_id = v_creator_id
      AND c.created_at >= ((v_stats.last_played + 2)::timestamp AT TIME ZONE 'Africa/Lagos')
      AND ca.player_id != v_creator_id;
    v_cleared := COALESCE(v_progress_friends, 0) >= (CASE v_day_number WHEN 1 THEN 3 WHEN 2 THEN 5 ELSE 7 END);
  ELSE
    SELECT count(*) INTO v_progress_challenges FROM (
      SELECT c.code
      FROM challenges c
      JOIN challenge_attempts ca ON ca.challenge_code = c.code AND ca.player_id != c.creator_id
      WHERE c.creator_id = v_creator_id
        AND c.created_at >= ((v_stats.last_played + 2)::timestamp AT TIME ZONE 'Africa/Lagos')
      GROUP BY c.code
      HAVING count(DISTINCT ca.player_id) >= 5
    ) qualifying;
    v_cleared := COALESCE(v_progress_challenges, 0) >= (CASE v_day_number WHEN 4 THEN 2 ELSE 3 END);
  END IF;

  IF v_cleared THEN
    UPDATE daily_stats SET last_played = v_today - 1 WHERE player_id = v_creator_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_streak_via_repair() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS restore_streak_via_repair_trigger ON public.challenge_attempts;
CREATE TRIGGER restore_streak_via_repair_trigger
  AFTER INSERT ON public.challenge_attempts
  FOR EACH ROW EXECUTE FUNCTION public.restore_streak_via_repair();
