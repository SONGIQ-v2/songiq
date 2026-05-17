REVOKE ALL ON FUNCTION public.grade_player_answer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_player_answer_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_is_host() FROM PUBLIC, anon, authenticated;