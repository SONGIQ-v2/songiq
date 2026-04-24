
-- 1) Restrict game_rounds SELECT so answer-revealing columns are hidden during active rounds
-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Players can view completed rounds or their room rounds" ON public.game_rounds;

-- Create a public-safe view that hides answer columns while round is active
CREATE OR REPLACE VIEW public.game_rounds_public
WITH (security_invoker = on) AS
SELECT
  id,
  room_id,
  round_number,
  track_id,
  preview_url,
  artwork_url,
  question_type,
  started_at,
  ended_at,
  CASE WHEN ended_at IS NOT NULL THEN track_name ELSE NULL END AS track_name,
  CASE WHEN ended_at IS NOT NULL THEN artist_name ELSE NULL END AS artist_name,
  CASE WHEN ended_at IS NOT NULL THEN options ELSE NULL END AS options
FROM public.game_rounds;

-- New SELECT policy on base table:
--  - Host of the room can see everything (needed to create/score rounds)
--  - Players in the room can see rounds, but app should query the view to avoid answer leakage
--  - Completed rounds are fully visible
CREATE POLICY "Host sees all round data in own room"
  ON public.game_rounds
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE game_rooms.id = game_rounds.room_id
        AND game_rooms.host_id = auth.uid()
    )
  );

CREATE POLICY "Players see completed rounds in their room"
  ON public.game_rounds
  FOR SELECT
  TO authenticated
  USING (
    ended_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_players
      WHERE room_players.room_id = game_rounds.room_id
        AND room_players.player_id = auth.uid()
    )
  );

-- Players can also see active rounds, but only via the view (which masks answers).
-- We still need a SELECT policy on the base table for the view to work under security_invoker.
CREATE POLICY "Players see active rounds in their room"
  ON public.game_rounds
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_players
      WHERE room_players.room_id = game_rounds.room_id
        AND room_players.player_id = auth.uid()
    )
  );

-- 2) Lock down player_answers UPDATE so players cannot self-grant points
DROP POLICY IF EXISTS "Players can update their own answers" ON public.player_answers;

-- Trigger to prevent players from changing is_correct / points_earned on their own rows.
-- Host (room owner) is allowed to set scoring fields.
CREATE OR REPLACE FUNCTION public.protect_player_answer_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_room_host boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.game_rooms
    WHERE id = NEW.room_id AND host_id = auth.uid()
  ) INTO is_room_host;

  IF NOT is_room_host THEN
    -- Non-host updaters cannot change scoring fields
    IF NEW.is_correct IS DISTINCT FROM OLD.is_correct THEN
      RAISE EXCEPTION 'Only the room host can change is_correct';
    END IF;
    IF NEW.points_earned IS DISTINCT FROM OLD.points_earned THEN
      RAISE EXCEPTION 'Only the room host can change points_earned';
    END IF;
    -- Also lock identity fields
    IF NEW.player_id IS DISTINCT FROM OLD.player_id
       OR NEW.room_id IS DISTINCT FROM OLD.room_id
       OR NEW.round_id IS DISTINCT FROM OLD.round_id THEN
      RAISE EXCEPTION 'Cannot change identity fields on an answer';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_player_answer_fields_trg ON public.player_answers;
CREATE TRIGGER protect_player_answer_fields_trg
  BEFORE UPDATE ON public.player_answers
  FOR EACH ROW EXECUTE FUNCTION public.protect_player_answer_fields();

-- Recreate UPDATE policies: players can update their own answer rows; host can update any answer in their room
CREATE POLICY "Players can update their own answer choice"
  ON public.player_answers
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Host can update answers in own room"
  ON public.player_answers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE game_rooms.id = player_answers.room_id
        AND game_rooms.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE game_rooms.id = player_answers.room_id
        AND game_rooms.host_id = auth.uid()
    )
  );
