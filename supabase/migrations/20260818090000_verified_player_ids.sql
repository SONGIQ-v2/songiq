-- Lets any page ask "which of these player_ids belong to a real, signed-in
-- (non-anonymous) account" -- used to show a verified badge next to a name
-- wherever one is listed (leaderboards, Daily/Challenge boards, multiplayer),
-- as a gentle nudge encouraging anonymous players to sign in.
--
-- auth.users isn't directly readable by anon/authenticated roles, and a
-- given player_id's anonymity never changes once created (Google sign-in is
-- always a brand-new, permanently non-anonymous auth user in this app's
-- current flow -- see gameStore.ts), so a live per-request lookup is both
-- necessary and always correct, with nothing to cache/denormalize.
CREATE OR REPLACE FUNCTION public.verified_player_ids(p_ids UUID[])
RETURNS TABLE (player_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE id = ANY(p_ids) AND is_anonymous = false;
$$;

GRANT EXECUTE ON FUNCTION public.verified_player_ids(UUID[]) TO anon, authenticated;
