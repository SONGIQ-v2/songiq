-- Stop leaking live round answers (game_rounds.track_name / artist_name).
--
-- game_rounds_public already masked these to NULL until ended_at (or the
-- host), but that masking was cosmetic: RLS filters ROWS, not columns, and
-- the base table's SELECT policy let any room member `select *` and read
-- the real answer directly, bypassing the view entirely. Worse, the
-- broadcast-from-database trigger sent the raw NEW row on every INSERT/
-- UPDATE -- meaning the correct answer was pushed to every subscriber's
-- browser the instant a round was created, 5s before it even starts,
-- whether or not anyone queried anything.

-- ----------------------------------------------------------------------------
-- 1) Rebuild game_rounds_public as a definer-style view (drop
-- security_invoker) with its own explicit membership check in WHERE.
--
-- The previous invoker-security view ran with the CALLER's own privileges
-- against the base table -- which is exactly why it couldn't be paired with
-- locking down the base table below: an invoker-security view still needs
-- the caller to hold SELECT on every column it references (even ones its
-- own CASE logic would mask to NULL), so revoking track_name/artist_name
-- from authenticated would have broken the view for every player, not just
-- blocked the bypass.
--
-- Running as the view's owner instead means it can read the real columns
-- regardless of the caller's own (now-restricted) grants -- but it also
-- means the base table's row-level RLS is no longer inherited automatically,
-- so the membership check has to be written into the view itself.
DROP VIEW IF EXISTS public.game_rounds_public;
CREATE VIEW public.game_rounds_public AS
SELECT
  r.id,
  r.room_id,
  r.round_number,
  r.track_id,
  r.preview_url,
  r.artwork_url,
  r.question_type,
  r.options,
  r.started_at,
  r.ended_at,
  CASE
    WHEN r.ended_at IS NOT NULL THEN r.track_name
    WHEN EXISTS (SELECT 1 FROM public.game_rooms gr WHERE gr.id = r.room_id AND gr.host_id = auth.uid())
      THEN r.track_name
    ELSE NULL
  END AS track_name,
  CASE
    WHEN r.ended_at IS NOT NULL THEN r.artist_name
    WHEN EXISTS (SELECT 1 FROM public.game_rooms gr WHERE gr.id = r.room_id AND gr.host_id = auth.uid())
      THEN r.artist_name
    ELSE NULL
  END AS artist_name
FROM public.game_rounds r
WHERE
  EXISTS (SELECT 1 FROM public.room_players rp WHERE rp.room_id = r.room_id AND rp.player_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.game_rooms gr WHERE gr.id = r.room_id AND gr.host_id = auth.uid());

GRANT SELECT ON public.game_rounds_public TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) Lock the base table's answer columns down. Every legitimate client
-- read now goes through the view above (grade_player_answer() and other
-- server-side functions are SECURITY DEFINER, unaffected by this -- they
-- run with the function owner's privileges, not the caller's).
-- ----------------------------------------------------------------------------
REVOKE SELECT ON public.game_rounds FROM authenticated;
GRANT SELECT (id, room_id, round_number, track_id, preview_url, artwork_url, question_type, options, started_at, ended_at)
  ON public.game_rounds TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) Strip track_name/artist_name from the game_rounds broadcast payload.
-- A dedicated trigger function (not the shared broadcast_room_change()
-- used by game_rooms/room_players) so the masking logic lives with the one
-- table it applies to.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_game_rounds_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
  v_new public.game_rounds;
  v_old public.game_rounds;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_room_id := OLD.room_id;
    v_old := OLD;
    v_old.track_name := NULL;
    v_old.artist_name := NULL;
  ELSE
    v_room_id := NEW.room_id;
    v_new := NEW;
    v_new.track_name := NULL;
    v_new.artist_name := NULL;
    IF TG_OP = 'UPDATE' THEN
      v_old := OLD;
      v_old.track_name := NULL;
      v_old.artist_name := NULL;
    END IF;
  END IF;

  PERFORM realtime.broadcast_changes(
    'room:' || v_room_id::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_game_rounds_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS broadcast_game_rounds_trigger ON public.game_rounds;
CREATE TRIGGER broadcast_game_rounds_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.game_rounds
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_game_rounds_change();
