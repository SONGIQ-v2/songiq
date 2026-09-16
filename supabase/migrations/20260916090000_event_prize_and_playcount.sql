-- Beach & Beyond's redesigned page (per the "SongIQ x Crackers" Stitch
-- design) surfaces two facts the original events schema didn't carry:
-- a per-event cash-prize label, and how many times each player has
-- attempted the event (shown as "N attempts" on the leaderboard).

ALTER TABLE public.events ADD COLUMN prize_label TEXT;

ALTER TABLE public.event_attempts ADD COLUMN play_count INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.submit_event_attempt(
  p_event_slug TEXT,
  p_score INTEGER,
  p_correct_count INTEGER,
  p_avg_response_ms INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_anon BOOLEAN;
  v_player_id UUID := auth.uid();
  v_player_name TEXT;
  v_ends_at TIMESTAMPTZ;
  v_is_active BOOLEAN;
BEGIN
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (auth.jwt() ->> 'is_anonymous')::boolean INTO v_is_anon;
  IF COALESCE(v_is_anon, true) THEN
    RAISE EXCEPTION 'Sign in required to play this event';
  END IF;

  SELECT ends_at, is_active INTO v_ends_at, v_is_active
  FROM events WHERE slug = p_event_slug;

  IF v_ends_at IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  IF NOT v_is_active THEN
    RAISE EXCEPTION 'Event is not active';
  END IF;
  IF now() > v_ends_at THEN
    RAISE EXCEPTION 'Event has ended';
  END IF;
  IF p_score NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Invalid score';
  END IF;
  IF p_correct_count NOT BETWEEN 0 AND 30 THEN
    RAISE EXCEPTION 'Invalid correct_count';
  END IF;
  IF p_avg_response_ms IS NOT NULL AND p_avg_response_ms NOT BETWEEN 0 AND 60000 THEN
    RAISE EXCEPTION 'Invalid avg_response_ms';
  END IF;

  SELECT raw_user_meta_data ->> 'full_name' INTO v_player_name FROM auth.users WHERE id = v_player_id;

  INSERT INTO event_attempts (event_slug, player_id, player_name, score, correct_count, avg_response_ms, play_count, updated_at)
  VALUES (p_event_slug, v_player_id, COALESCE(NULLIF(trim(v_player_name), ''), 'A music fan'), p_score, p_correct_count, p_avg_response_ms, 1, now())
  ON CONFLICT (event_slug, player_id) DO UPDATE SET
    score = EXCLUDED.score,
    correct_count = EXCLUDED.correct_count,
    avg_response_ms = EXCLUDED.avg_response_ms,
    play_count = event_attempts.play_count + 1,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.submit_event_attempt(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_event_attempt(TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

UPDATE public.events SET prize_label = '₦10,000 Cash' WHERE slug = 'bnb';
