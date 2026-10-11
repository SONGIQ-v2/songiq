-- Bug fix: a player whose phone clock ran ahead scored the full 200 points
-- every multiplayer round, however slowly they answered.
--
-- Each round is created with started_at ~10s in the future (the prefetch
-- window), and clients decided when the round "starts" from their own
-- device clock. A clock running ahead showed the options early, so every
-- answer reached the server BEFORE started_at; grade_player_answer() then
-- computed a negative answer time, clamped it to 0 ms, and awarded the
-- maximum speed bonus.
--
-- Two halves, shipped together:
--  1. Client (useMultiplayerGame.ts / src/lib/serverClock.ts): estimate the
--     device clock's offset from the database clock via server_time_ms()
--     and use that for all round timing -- the round now starts at the same
--     instant on every phone, whatever its clock says.
--  2. Server (here): a correct answer arriving more than 1s before the
--     round's started_at earns the base 100 but no speed bonus -- the round
--     hadn't started, so there's no fair answer time to reward. It's still
--     credited as correct: with (1) in place this only happens when the
--     clock sync failed or the device clock jumped mid-game, which isn't
--     the player's fault (or with a modified client, which still can't get
--     the free 200). The 1s grace absorbs residual offset estimate error.

-- Used by the client to estimate its clock offset. Already exists from an
-- earlier attempt (20260525, later reverted on the client); recreated here
-- so this migration stands on its own.
CREATE OR REPLACE FUNCTION public.server_time_ms()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

REVOKE ALL ON FUNCTION public.server_time_ms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_time_ms() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.grade_player_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_track text;
  r_artist text;
  r_qtype text;
  r_started timestamptz;
  r_ended timestamptz;
  r_time_per_round int;
  correct boolean;
  answer_ms bigint;
  max_ms bigint;
  time_bonus int;
  round_close timestamptz;
  is_late boolean;
  is_early boolean;
BEGIN
  SELECT gr.track_name, gr.artist_name, gr.question_type, gr.started_at, gr.ended_at, rm.time_per_round
    INTO r_track, r_artist, r_qtype, r_started, r_ended, r_time_per_round
  FROM public.game_rounds gr
  JOIN public.game_rooms rm ON rm.id = gr.room_id
  WHERE gr.id = NEW.round_id;

  IF r_track IS NULL THEN
    RETURN NEW;
  END IF;

  IF r_qtype = 'song' THEN
    correct := public.normalize_quiz_answer(NEW.answer) = public.normalize_quiz_answer(r_track);
  ELSE
    correct := public.normalize_quiz_answer(NEW.answer) = public.normalize_quiz_answer(r_artist);
  END IF;

  NEW.is_correct := correct;

  max_ms := COALESCE(r_time_per_round, 15) * 1000;
  -- Same "is this round still open" boundary as the reveal-timing RLS
  -- policy in 20260829090000_fix_reveal_timing_gate.sql, plus a small grace
  -- window so an honestly in-flight request isn't zeroed by racing it.
  round_close := COALESCE(r_ended, r_started + make_interval(secs => COALESCE(r_time_per_round, 15)));
  is_late := now() > round_close + interval '1.5 seconds';
  -- Answered before the round had started (clock sync failed / device
  -- clock jumped, or a modified client): no fair answer time exists, so
  -- the correct answer earns the base 100 without a speed bonus.
  is_early := now() < r_started - interval '1 second';

  IF correct AND NOT is_late AND is_early THEN
    NEW.points_earned := 100;
  ELSIF correct AND NOT is_late THEN
    answer_ms := GREATEST(0, EXTRACT(EPOCH FROM (now() - r_started)) * 1000)::bigint;
    answer_ms := LEAST(answer_ms, max_ms);
    time_bonus := GREATEST(0, FLOOR(((max_ms - answer_ms)::numeric / max_ms) * 100))::int;
    NEW.points_earned := 100 + time_bonus;
  ELSE
    NEW.points_earned := 0;
  END IF;

  RETURN NEW;
END;
$$;
