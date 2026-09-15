-- Event challenges: partner-community events (physical events listing
-- SongIQ on their schedule via a dedicated link, e.g. /bnb for Beach &
-- Beyond). Structurally different from Daily/Challenge: no fixed shared
-- song set (every play randomly redraws from a playlist, same mechanic as
-- plain Solo mode), sign-in required, and replayable with only the most
-- recent attempt kept (last-write-wins, not first-attempt-counts).
--
-- Generic events/event_attempts rather than a one-off "bnb" table, since a
-- second event is the explicitly stated plan.

CREATE TABLE public.events (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  playlist_id TEXT NOT NULL, -- references playlists.ts's Playlist.id, not a DB FK (playlists live in code)
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Nullable branding overrides -- a future event can look like its own
  -- partner's brand instead of default SongIQ dark/gold/Starfield. Both
  -- NULL means EventChallenge.tsx falls back to the standard look.
  background_image_url TEXT,
  accent_color TEXT
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view events"
  ON public.events
  FOR SELECT
  TO anon, authenticated
  USING (true);
-- No client writes -- events are seeded/edited directly via SQL for now.

CREATE TABLE public.event_attempts (
  event_slug TEXT NOT NULL REFERENCES public.events(slug) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name TEXT NOT NULL DEFAULT 'A music fan',
  score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  avg_response_ms INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_slug, player_id)
);

CREATE INDEX event_attempts_slug_score_idx ON public.event_attempts (event_slug, score DESC);

ALTER TABLE public.event_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view event attempts"
  ON public.event_attempts
  FOR SELECT
  TO anon, authenticated
  USING (true);
-- No INSERT/UPDATE policy -- writes only via submit_event_attempt() below.

-- Records (or overwrites) the calling player's single attempt for an event.
-- Unlike add_player_points()'s additive accumulation, this is a plain
-- last-write-wins overwrite -- only the most recent play is kept, matching
-- "you can replay, but only your last attempt counts."
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

  -- Real access-control boundary, not just a hidden Play button -- an
  -- anonymous session must never be able to record an event attempt, even
  -- via a direct RPC call.
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

  INSERT INTO event_attempts (event_slug, player_id, player_name, score, correct_count, avg_response_ms, updated_at)
  VALUES (p_event_slug, v_player_id, COALESCE(NULLIF(trim(v_player_name), ''), 'A music fan'), p_score, p_correct_count, p_avg_response_ms, now())
  ON CONFLICT (event_slug, player_id) DO UPDATE SET
    score = EXCLUDED.score,
    correct_count = EXCLUDED.correct_count,
    avg_response_ms = EXCLUDED.avg_response_ms,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.submit_event_attempt(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_event_attempt(TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

-- Seed: Beach & Beyond. Placeholder end date -- update once the real one is
-- confirmed: UPDATE public.events SET ends_at = '...' WHERE slug = 'bnb';
INSERT INTO public.events (slug, name, playlist_id, ends_at)
VALUES ('bnb', 'Beach & Beyond', 'afrobeats-chill', now() + interval '30 days');
