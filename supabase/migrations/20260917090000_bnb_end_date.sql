-- Beach & Beyond's real cutoff: September 27, 2026, 12:00 AM Lagos time
-- (UTC+1) -- same "Lagos midnight" convention the Daily Challenge boundary
-- uses elsewhere in this app. Replaces the placeholder 30-day-out date the
-- events migration seeded.
UPDATE public.events SET ends_at = '2026-09-26T23:00:00Z' WHERE slug = 'bnb';
