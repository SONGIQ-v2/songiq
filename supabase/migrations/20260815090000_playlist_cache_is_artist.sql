-- Fix: the Daily Challenge generator (cleanup-stale-rooms) decided whether a
-- playlist was artist-only via its OWN hardcoded name list, completely
-- disconnected from src/lib/playlists.ts's `isArtist` flag (the single
-- source of truth everywhere else in the app). That list was missing most
-- of the app's actual artist playlists, so "Guess the Artist" rounds could
-- slip into a Daily Challenge built from one of them -- and every future
-- artist playlist added to playlists.ts would have the same bug unless
-- someone remembered to also update that separate list by hand.
--
-- Fix: store is_artist on playlist_cache itself, populated by the client
-- (which already knows it from playlists.ts) on every cache write. The
-- Daily Challenge generator reads this column directly instead of
-- maintaining a parallel list.

ALTER TABLE public.playlist_cache ADD COLUMN is_artist BOOLEAN NOT NULL DEFAULT false;

-- One-time backfill for playlists already cached, so the fix takes effect
-- immediately rather than waiting for each one's next 24h refresh.
UPDATE public.playlist_cache SET is_artist = true
WHERE playlist_name IN (
  'Rihanna', 'Adele', 'Taylor Swift', 'Justin Bieber', 'Sam Smith', 'Ed Sheeran',
  'Beyoncé', 'Chris Brown', 'Wizkid', 'Davido', 'Burna Boy', 'Olamide',
  'John Legend', 'Usher', 'Alicia Keys', 'Boyz II Men', 'SZA', 'Michael Jackson',
  'Sinach', 'Adekunle Gold', 'Mike Abdul', 'Rema', 'Asake', 'Simi', 'Tiwa Savage',
  'Nathaniel Bassey', 'Moses Bliss', 'Don Moen', 'Marvin Sapp', 'William McDowell',
  'Todd Dulaney', 'Travis Greene', 'Tye Tribbett', 'Kirk Franklin',
  'Donnie McClurkin', 'Tasha Cobbs Leonard'
);
