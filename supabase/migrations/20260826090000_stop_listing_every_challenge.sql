-- Stop letting anyone dump every challenge (quiz rounds + answers) ever
-- created. The original policy's own comment reasoned "anyone with the
-- code can load a challenge (codes are unguessable enough)" -- true for a
-- targeted lookup, but USING (true) doesn't actually require the code at
-- all: any client could `select * from challenges` and get literally
-- every challenge, defeating the "unguessable code" model the same way
-- the open game_rooms listing did. (daily_challenges had this identical
-- bug and was already fixed the same way, in 20260725190000_security_hardening.sql.)

DROP POLICY IF EXISTS "Anyone can view challenges" ON public.challenges;
CREATE POLICY "View your own created challenges"
  ON public.challenges FOR SELECT
  TO authenticated
  USING (creator_id = auth.uid());

-- The actual "anyone with the link can view" path -- a single row, keyed
-- by the code, matching the same auth level (anon + authenticated) the
-- table policy previously granted.
CREATE OR REPLACE FUNCTION public.get_challenge_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge public.challenges;
BEGIN
  SELECT * INTO v_challenge FROM public.challenges WHERE code = upper(p_code);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_challenge);
END;
$$;

REVOKE ALL ON FUNCTION public.get_challenge_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_by_code(text) TO anon, authenticated;
