-- Server-side cache of playlist track pools fetched from iTunes.
-- The apple-music edge function serves from this table (24h TTL) instead of
-- fanning out ~25 iTunes searches per request; a daily refresh keeps it warm
-- and picks up newly released music.

CREATE TABLE public.playlist_cache (
  playlist_name TEXT NOT NULL PRIMARY KEY,
  search_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service-role only (edge functions); no client policies needed.
ALTER TABLE public.playlist_cache ENABLE ROW LEVEL SECURITY;
