-- Singleton settings row, same pattern as google_oauth_tokens -- starting
-- with just the sign-in/points notification's threshold (previously
-- hardcoded to 200 in NotificationBar.tsx), extensible to future settings
-- as more columns without a new table each time.
CREATE TABLE public.site_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  signin_points_threshold INTEGER NOT NULL DEFAULT 200,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.site_settings (id) VALUES (1);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Every visitor needs to read this (NotificationBar checks it for every
-- anonymous player), nothing sensitive in it -- readable by anyone.
CREATE POLICY "Anyone can view site settings"
  ON public.site_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies -- service-role only, via admin-analytics.
REVOKE INSERT, UPDATE, DELETE ON public.site_settings FROM PUBLIC, anon, authenticated;
