-- Security hardening pass:
-- 1. Extend the existing room_players/game_rooms name-validation pattern to
--    challenges, challenge_attempts, and daily_attempts, which were missing
--    it — their player_name/creator_name columns had no server-side control-
--    character stripping, unlike every other name field in the app.
-- 2. Gate daily_challenges SELECT to today-or-earlier — today nothing ever
--    inserts a future row, but the policy itself allowed reading one if it
--    ever existed (a future feature/bug could otherwise leak tomorrow's
--    answers to anyone with the anon key).
-- 3. Tighten client_logs INSERT so a caller can't attribute a log row to a
--    different player_id than their own (log spoofing).

-- 1a. challenge_attempts.player_name and daily_attempts.player_name already
-- match the existing validate_player_name() signature (NEW.player_name) —
-- just attach it as a trigger on both tables.
CREATE TRIGGER validate_challenge_attempts_name
  BEFORE INSERT OR UPDATE ON public.challenge_attempts
  FOR EACH ROW EXECUTE FUNCTION public.validate_player_name();

CREATE TRIGGER validate_daily_attempts_name
  BEFORE INSERT OR UPDATE ON public.daily_attempts
  FOR EACH ROW EXECUTE FUNCTION public.validate_player_name();

-- 1b. challenges.creator_name needs its own function (different column name),
-- mirroring validate_host_name() exactly.
CREATE OR REPLACE FUNCTION public.validate_creator_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.creator_name := trim(NEW.creator_name);
  IF length(NEW.creator_name) < 1 OR length(NEW.creator_name) > 50 THEN
    RAISE EXCEPTION 'Creator name must be 1-50 characters';
  END IF;
  IF NEW.creator_name ~ E'[\\x00-\\x1F\\x7F]' THEN
    RAISE EXCEPTION 'Creator name contains invalid characters';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_challenges_creator_name
  BEFORE INSERT OR UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.validate_creator_name();

-- 2. daily_challenges: only ever expose today-or-past rows via the public
-- read policy, regardless of what gets inserted in the future.
DROP POLICY IF EXISTS "Anyone can view daily challenges" ON public.daily_challenges;
CREATE POLICY "Anyone can view past or today's daily challenges" ON public.daily_challenges
  FOR SELECT TO anon, authenticated
  USING (challenge_date <= (now() AT TIME ZONE 'Africa/Lagos')::date);

-- 3. client_logs: allow a null player_id (fully anonymous diagnostic entry)
-- or your own — never someone else's.
DROP POLICY IF EXISTS "Anyone can insert client logs" ON public.client_logs;
CREATE POLICY "Anyone can insert their own client logs" ON public.client_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (player_id IS NULL OR auth.uid() = player_id);
