
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
  r_time_per_round int;
  correct boolean;
  answer_ms bigint;
  max_ms bigint;
  time_bonus int;
BEGIN
  SELECT gr.track_name, gr.artist_name, gr.question_type, gr.started_at, rm.time_per_round
    INTO r_track, r_artist, r_qtype, r_started, r_time_per_round
  FROM public.game_rounds gr
  JOIN public.game_rooms rm ON rm.id = gr.room_id
  WHERE gr.id = NEW.round_id;

  IF r_track IS NULL THEN
    RETURN NEW;
  END IF;

  IF r_qtype = 'song' THEN
    correct := NEW.answer = r_track;
  ELSE
    correct := NEW.answer = r_artist;
  END IF;

  NEW.is_correct := correct;

  IF correct THEN
    max_ms := COALESCE(r_time_per_round, 15) * 1000;
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

DROP TRIGGER IF EXISTS grade_player_answer_trigger ON public.player_answers;
CREATE TRIGGER grade_player_answer_trigger
BEFORE INSERT ON public.player_answers
FOR EACH ROW EXECUTE FUNCTION public.grade_player_answer();
