-- Save Daily / challenge progress after every round, with resume.
--
-- Until now an attempt row was only inserted when the results screen
-- appeared, so closing the tab mid-game saved nothing: a player could learn
-- the answers round by round (each one is revealed after answering), close,
-- restart and repeat until they played a perfect game.
--
-- Now the row is created when round 1 is answered and advanced one round at
-- a time through record_daily_round() / record_challenge_round(). Quitting
-- gives no advantage, an accidental close resumes from the next round, and an
-- abandoned play keeps its partial score.
--
-- An unfinished play can be continued until midnight (Lagos) of the day it
-- was started; after that it's final. Leaderboards show unfinished plays
-- straight away with their score so far, labelled "incomplete" client-side
-- (in_progress = true).
--
-- Old cached clients keep working: their end-of-game direct INSERT still
-- lands (in_progress defaults to false = finished), now with sane score caps.

-- ============================================================
-- Columns
-- ============================================================

ALTER TABLE public.daily_attempts
  ADD COLUMN IF NOT EXISTS in_progress BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rounds_completed INTEGER,
  ADD COLUMN IF NOT EXISTS round_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.challenge_attempts
  ADD COLUMN IF NOT EXISTS in_progress BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rounds_completed INTEGER,
  ADD COLUMN IF NOT EXISTS round_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ============================================================
-- Direct INSERT (old clients only): finished rows, plausible scores
-- ============================================================
-- Max points per correct answer is 200 (calculatePoints(): 100 base + up to
-- 100 speed bonus). A direct insert can't create an in-progress row -- only
-- the RPCs below can, so round_results can't be forged and later advanced.

DROP POLICY IF EXISTS "Players can record their own daily attempt" ON public.daily_attempts;
CREATE POLICY "Players can record their own daily attempt"
  ON public.daily_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND correct_count BETWEEN 0 AND 20
    AND score BETWEEN 0 AND correct_count * 200
    AND (avg_response_ms IS NULL OR avg_response_ms BETWEEN 0 AND 60000)
    AND NOT in_progress
    AND rounds_completed IS NULL
    AND round_results = '[]'::jsonb
  );

DROP POLICY IF EXISTS "Players can record their own attempt" ON public.challenge_attempts;
CREATE POLICY "Players can record their own attempt"
  ON public.challenge_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND correct_count BETWEEN 0 AND 20
    AND score BETWEEN 0 AND correct_count * 200
    AND (avg_response_ms IS NULL OR avg_response_ms BETWEEN 0 AND 60000)
    AND NOT in_progress
    AND rounds_completed IS NULL
    AND round_results = '[]'::jsonb
  );

-- ============================================================
-- Shared helpers
-- ============================================================

-- One round's stored result: correct, points (clamped), answer time.
CREATE OR REPLACE FUNCTION public.attempt_round_entry(p_correct BOOLEAN, p_points INTEGER, p_answer_ms INTEGER)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'c', coalesce(p_correct, false),
    'p', CASE WHEN coalesce(p_correct, false) THEN LEAST(GREATEST(coalesce(p_points, 0), 0), 200) ELSE 0 END,
    'ms', CASE WHEN p_answer_ms BETWEEN 0 AND 60000 THEN p_answer_ms END
  );
$$;

-- Average answer time over answered rounds (timeouts have no time).
CREATE OR REPLACE FUNCTION public.attempt_avg_response_ms(p_results JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(avg((e->>'ms')::int))::int
  FROM jsonb_array_elements(p_results) e
  WHERE e->>'ms' IS NOT NULL;
$$;

-- ============================================================
-- Daily
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_daily_round(
  p_date DATE,
  p_round INTEGER,
  p_correct BOOLEAN,
  p_points INTEGER,
  p_answer_ms INTEGER,
  p_player_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_total INTEGER;
  v_entry JSONB;
  v_row daily_attempts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT CASE WHEN jsonb_typeof(plan) = 'array' THEN jsonb_array_length(plan) END
  INTO v_total
  FROM daily_challenges WHERE challenge_date = p_date;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'No Daily Challenge for %', p_date;
  END IF;
  IF p_round IS NULL OR p_round < 1 OR p_round > v_total THEN
    RAISE EXCEPTION 'Invalid round %', p_round;
  END IF;

  -- Only today's Daily can be played: an unfinished play is final at midnight.
  IF p_date <> v_today THEN
    RAISE EXCEPTION 'This Daily Challenge has ended';
  END IF;

  v_entry := attempt_round_entry(p_correct, p_points, p_answer_ms);

  IF p_round = 1 THEN
    INSERT INTO daily_attempts (
      challenge_date, player_id, player_name, score, correct_count, avg_response_ms,
      in_progress, rounds_completed, round_results, updated_at
    ) VALUES (
      p_date, v_uid, coalesce(nullif(trim(p_player_name), ''), 'A music fan'),
      (v_entry->>'p')::int, CASE WHEN (v_entry->>'c')::boolean THEN 1 ELSE 0 END,
      (v_entry->>'ms')::int,
      v_total > 1, 1, jsonb_build_array(v_entry), now()
    )
    ON CONFLICT (challenge_date, player_id) DO NOTHING;
  ELSE
    -- Advance exactly one round, only while the play is still live.
    -- Re-sending a round that already landed matches nothing (idempotent).
    UPDATE daily_attempts SET
      round_results = round_results || jsonb_build_array(v_entry),
      rounds_completed = p_round,
      score = score + (v_entry->>'p')::int,
      correct_count = correct_count + CASE WHEN (v_entry->>'c')::boolean THEN 1 ELSE 0 END,
      avg_response_ms = attempt_avg_response_ms(round_results || jsonb_build_array(v_entry)),
      in_progress = p_round < v_total,
      updated_at = now()
    WHERE challenge_date = p_date
      AND player_id = v_uid
      AND in_progress
      AND rounds_completed = p_round - 1;
  END IF;

  SELECT * INTO v_row FROM daily_attempts WHERE challenge_date = p_date AND player_id = v_uid;
  RETURN jsonb_build_object(
    'in_progress', v_row.in_progress,
    'rounds_completed', v_row.rounds_completed,
    'score', v_row.score,
    'correct_count', v_row.correct_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_daily_round(DATE, INTEGER, BOOLEAN, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_daily_round(DATE, INTEGER, BOOLEAN, INTEGER, INTEGER, TEXT) TO authenticated;

-- In-app "Leave": the current partial score becomes final.
CREATE OR REPLACE FUNCTION public.finish_daily_attempt(p_date DATE)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE daily_attempts SET in_progress = false, updated_at = now()
  WHERE challenge_date = p_date AND player_id = auth.uid() AND in_progress;
$$;

REVOKE ALL ON FUNCTION public.finish_daily_attempt(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_daily_attempt(DATE) TO authenticated;

-- daily_stats.total_score: apply_daily_attempt() (AFTER INSERT) only counted
-- round 1's points -- add every later change to the row's score.
CREATE OR REPLACE FUNCTION public.apply_daily_attempt_score_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.score IS DISTINCT FROM OLD.score THEN
    UPDATE daily_stats
    SET total_score = total_score + (NEW.score - OLD.score)
    WHERE player_id = NEW.player_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_daily_attempt_score_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS apply_daily_attempt_score_change_trigger ON public.daily_attempts;
CREATE TRIGGER apply_daily_attempt_score_change_trigger
  AFTER UPDATE OF score ON public.daily_attempts
  FOR EACH ROW EXECUTE FUNCTION public.apply_daily_attempt_score_change();

-- ============================================================
-- Challenges
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_challenge_round(
  p_code TEXT,
  p_round INTEGER,
  p_correct BOOLEAN,
  p_points INTEGER,
  p_answer_ms INTEGER,
  p_player_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT := upper(p_code);
  v_today DATE := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_total INTEGER;
  v_entry JSONB;
  v_row challenge_attempts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT CASE WHEN jsonb_typeof(plan) = 'array' THEN jsonb_array_length(plan) END
  INTO v_total
  FROM challenges WHERE code = v_code;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'Challenge % not found', v_code;
  END IF;
  IF p_round IS NULL OR p_round < 1 OR p_round > v_total THEN
    RAISE EXCEPTION 'Invalid round %', p_round;
  END IF;

  v_entry := attempt_round_entry(p_correct, p_points, p_answer_ms);

  IF p_round = 1 THEN
    INSERT INTO challenge_attempts (
      challenge_code, player_id, player_name, score, correct_count, avg_response_ms,
      in_progress, rounds_completed, round_results, updated_at
    ) VALUES (
      v_code, v_uid, coalesce(nullif(trim(p_player_name), ''), 'A music fan'),
      (v_entry->>'p')::int, CASE WHEN (v_entry->>'c')::boolean THEN 1 ELSE 0 END,
      (v_entry->>'ms')::int,
      v_total > 1, 1, jsonb_build_array(v_entry), now()
    )
    ON CONFLICT (challenge_code, player_id) DO NOTHING;
  ELSE
    UPDATE challenge_attempts SET
      round_results = round_results || jsonb_build_array(v_entry),
      rounds_completed = p_round,
      score = score + (v_entry->>'p')::int,
      correct_count = correct_count + CASE WHEN (v_entry->>'c')::boolean THEN 1 ELSE 0 END,
      avg_response_ms = attempt_avg_response_ms(round_results || jsonb_build_array(v_entry)),
      in_progress = p_round < v_total,
      updated_at = now()
    WHERE challenge_code = v_code
      AND player_id = v_uid
      AND in_progress
      AND rounds_completed = p_round - 1
      -- Continuable until midnight (Lagos) of the day it was started.
      AND (created_at AT TIME ZONE 'Africa/Lagos')::date = v_today;
  END IF;

  SELECT * INTO v_row FROM challenge_attempts WHERE challenge_code = v_code AND player_id = v_uid;
  RETURN jsonb_build_object(
    'in_progress', v_row.in_progress,
    'rounds_completed', v_row.rounds_completed,
    'score', v_row.score,
    'correct_count', v_row.correct_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_challenge_round(TEXT, INTEGER, BOOLEAN, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_challenge_round(TEXT, INTEGER, BOOLEAN, INTEGER, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_challenge_attempt(p_code TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE challenge_attempts SET in_progress = false, updated_at = now()
  WHERE challenge_code = upper(p_code) AND player_id = auth.uid() AND in_progress;
$$;

REVOKE ALL ON FUNCTION public.finish_challenge_attempt(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_challenge_attempt(TEXT) TO authenticated;

-- Streak repair counts a friend's play only once it's finished -- otherwise
-- answering a single round and quitting would count toward a repair now
-- that round 1 creates the row.
DROP TRIGGER IF EXISTS restore_streak_via_repair_trigger ON public.challenge_attempts;
CREATE TRIGGER restore_streak_via_repair_trigger
  AFTER INSERT ON public.challenge_attempts
  FOR EACH ROW
  WHEN (NOT NEW.in_progress)
  EXECUTE FUNCTION public.restore_streak_via_repair();

DROP TRIGGER IF EXISTS restore_streak_via_repair_finish_trigger ON public.challenge_attempts;
CREATE TRIGGER restore_streak_via_repair_finish_trigger
  AFTER UPDATE OF in_progress ON public.challenge_attempts
  FOR EACH ROW
  WHEN (OLD.in_progress AND NOT NEW.in_progress)
  EXECUTE FUNCTION public.restore_streak_via_repair();
