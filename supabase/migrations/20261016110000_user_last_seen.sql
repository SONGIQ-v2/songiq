-- "Last seen" for signed-in accounts, shown in /admin's user table.
--
-- auth.users.last_sign_in_at only moves on a fresh login. Sessions persist
-- and auto-refresh, so a player who signed in once in August and plays daily
-- still showed August. The app now calls touch_last_seen() whenever a
-- signed-in session loads, refreshes, or the tab comes back into view.

CREATE TABLE IF NOT EXISTS public.user_last_seen (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now()
);

-- No policies: only touch_last_seen() (below) and the service role
-- (admin-analytics) ever read or write it.
ALTER TABLE public.user_last_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_last_seen FROM anon, authenticated;

-- Records "now" for the caller. Anonymous sessions are skipped (the admin
-- table only lists signed-in accounts), and writes are throttled to one per
-- 5 minutes per account so tab switching can't hammer the table.
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_last_seen (user_id, last_seen)
  VALUES (v_uid, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_seen = excluded.last_seen
    WHERE public.user_last_seen.last_seen < now() - interval '5 minutes';
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;
