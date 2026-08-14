-- Hide other players' answers (and correctness) until the round's reveal.
--
-- player_answers' SELECT policy let any room member read the whole room's
-- rows at any time -- including mid-round, before anyone was supposed to
-- see what an opponent picked or whether they got it right. The INSERT
-- broadcast made this worse by pushing answer/is_correct/points_earned to
-- every subscriber the instant anyone answered, live. The UI already
-- withheld this visually until the reveal window (roundAnswers[option] is
-- gated on revealActive in MultiplayerGame.tsx), but the underlying data
-- was already sitting in every client's state well before that -- same
-- "client politeness, no server enforcement" gap as the round-answer leak.

-- ----------------------------------------------------------------------------
-- 1) SELECT: your own row always; the rest of the room only once the
-- round has ended. Membership is still required either way -- this only
-- adds a time gate on top of the existing room-membership check.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Room players can view answers in their room" ON public.player_answers;
CREATE POLICY "Own answer always, full room after reveal"
  ON public.player_answers FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR (
      EXISTS (SELECT 1 FROM public.room_players rp WHERE rp.room_id = player_answers.room_id AND rp.player_id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.game_rounds gr WHERE gr.id = player_answers.round_id AND gr.ended_at IS NOT NULL)
    )
  );

-- ----------------------------------------------------------------------------
-- 2) Strip answer/is_correct/points_earned from the broadcast. A player's
-- own grade already reaches them a different way -- submitAnswer()'s
-- insert response (select("is_correct, points_earned") on the row they
-- themselves just inserted, which own-row SELECT always allows) -- so this
-- doesn't need a host/self exception the way game_rounds' view does.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_player_answers_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new public.player_answers;
BEGIN
  v_new := NEW;
  v_new.answer := NULL;
  v_new.is_correct := NULL;
  v_new.points_earned := NULL;

  PERFORM realtime.broadcast_changes(
    'room:' || NEW.room_id::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    NULL
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_player_answers_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS broadcast_player_answers_trigger ON public.player_answers;
CREATE TRIGGER broadcast_player_answers_trigger
  AFTER INSERT ON public.player_answers
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_player_answers_change();
