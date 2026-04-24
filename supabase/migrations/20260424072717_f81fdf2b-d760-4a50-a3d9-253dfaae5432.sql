
-- Recreate view from scratch (column order changed so CREATE OR REPLACE fails)
DROP VIEW IF EXISTS public.game_rounds_public;

CREATE VIEW public.game_rounds_public
WITH (security_invoker = on) AS
SELECT
  r.id,
  r.room_id,
  r.round_number,
  r.track_id,
  r.preview_url,
  r.artwork_url,
  r.question_type,
  r.options,
  r.started_at,
  r.ended_at,
  CASE
    WHEN r.ended_at IS NOT NULL THEN r.track_name
    WHEN EXISTS (SELECT 1 FROM public.game_rooms gr WHERE gr.id = r.room_id AND gr.host_id = auth.uid())
      THEN r.track_name
    ELSE NULL
  END AS track_name,
  CASE
    WHEN r.ended_at IS NOT NULL THEN r.artist_name
    WHEN EXISTS (SELECT 1 FROM public.game_rooms gr WHERE gr.id = r.room_id AND gr.host_id = auth.uid())
      THEN r.artist_name
    ELSE NULL
  END AS artist_name
FROM public.game_rounds r;

GRANT SELECT ON public.game_rounds_public TO authenticated;
