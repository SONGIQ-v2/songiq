
-- Drop the unsafe self-update policy; players only INSERT, host/server grades.
DROP POLICY IF EXISTS "Players can update their own answer choice" ON public.player_answers;

-- Ensure triggers are attached (idempotent)
DROP TRIGGER IF EXISTS grade_player_answer_trigger ON public.player_answers;
CREATE TRIGGER grade_player_answer_trigger
  BEFORE INSERT ON public.player_answers
  FOR EACH ROW EXECUTE FUNCTION public.grade_player_answer();

DROP TRIGGER IF EXISTS protect_player_answer_fields_trigger ON public.player_answers;
CREATE TRIGGER protect_player_answer_fields_trigger
  BEFORE UPDATE ON public.player_answers
  FOR EACH ROW EXECUTE FUNCTION public.protect_player_answer_fields();

DROP TRIGGER IF EXISTS validate_player_name_trigger ON public.room_players;
CREATE TRIGGER validate_player_name_trigger
  BEFORE INSERT OR UPDATE ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.validate_player_name();

DROP TRIGGER IF EXISTS enforce_is_host_trigger ON public.room_players;
CREATE TRIGGER enforce_is_host_trigger
  BEFORE INSERT OR UPDATE ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.enforce_is_host();

DROP TRIGGER IF EXISTS validate_host_name_trigger ON public.game_rooms;
CREATE TRIGGER validate_host_name_trigger
  BEFORE INSERT OR UPDATE ON public.game_rooms
  FOR EACH ROW EXECUTE FUNCTION public.validate_host_name();
