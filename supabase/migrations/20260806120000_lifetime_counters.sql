-- Permanent, insert-only log of every room/challenge creation -- never
-- purged by cleanup-stale-rooms (game_rooms rows die within 15min-2h
-- depending on status; challenges after 30 days). Every admin-dashboard
-- count (all-time AND date-range) derives from this table instead of
-- COUNT(*) on the source tables directly, which only ever reflects
-- whatever hasn't been purged yet.
CREATE TABLE public.creation_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('room', 'challenge')),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX creation_log_event_type_created_at_idx ON public.creation_log (event_type, created_at);

ALTER TABLE public.creation_log ENABLE ROW LEVEL SECURITY;
-- No policies -- service-role only (admin-analytics), same as google_oauth_tokens.
REVOKE ALL ON public.creation_log FROM PUBLIC, anon, authenticated;

-- Backfill from whatever currently exists, so counts start from a real
-- baseline instead of zero. Still misses waiting rooms that already timed
-- out with no archive before today -- that history is unrecoverable -- but
-- game_rooms + game_history covers everything not already purged.
INSERT INTO public.creation_log (event_type, created_at)
SELECT 'room', created_at FROM public.game_rooms
UNION ALL
SELECT 'room', created_at FROM public.game_history
UNION ALL
SELECT 'challenge', created_at FROM public.challenges;

CREATE OR REPLACE FUNCTION public.log_room_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.creation_log (event_type, created_at) VALUES ('room', NEW.created_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_room_created
AFTER INSERT ON public.game_rooms
FOR EACH ROW EXECUTE FUNCTION public.log_room_created();

CREATE OR REPLACE FUNCTION public.log_challenge_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.creation_log (event_type, created_at) VALUES ('challenge', NEW.created_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_challenge_created
AFTER INSERT ON public.challenges
FOR EACH ROW EXECUTE FUNCTION public.log_challenge_created();
