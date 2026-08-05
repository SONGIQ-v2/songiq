-- Stores the single refresh token from the one-time "Connect Google
-- Analytics" OAuth flow (see admin-analytics edge function). Written once
-- during connect, read on every /admin report request to mint a fresh
-- access token. Service-role only — no client policy at all, since this
-- is a credential, not app data.
CREATE TABLE public.google_oauth_tokens (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- single row
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (used by edge functions) can read or
-- write this table; anon/authenticated get nothing.
