-- Admin-managed notification bar, shown site-wide above the Header. Content
-- is raw HTML the admin writes directly (trusted-admin-only input, same
-- trust level as the Daily Challenge picker -- no sanitization needed here).
-- Only one can be active at a time, enforced at the DB level so a bug in the
-- admin UI can never leave two live simultaneously, not just prevented by it.
CREATE TABLE public.site_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,        -- admin-facing name, never shown to players
  html TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX site_notifications_one_active ON public.site_notifications (is_active) WHERE is_active;

ALTER TABLE public.site_notifications ENABLE ROW LEVEL SECURITY;

-- Every visitor (anon + authenticated, i.e. every player, signed in or not)
-- can read only the currently-live notification -- draft/inactive rows stay
-- admin-only-visible (read via admin-analytics with the service role).
CREATE POLICY "Anyone can view the active notification"
  ON public.site_notifications FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- No INSERT/UPDATE/DELETE policies -- service-role only, via admin-analytics,
-- same pattern as creation_log/room_archive.
REVOKE INSERT, UPDATE, DELETE ON public.site_notifications FROM PUBLIC, anon, authenticated;
