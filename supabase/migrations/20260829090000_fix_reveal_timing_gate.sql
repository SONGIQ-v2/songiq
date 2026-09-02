-- Fix: reveal (both player_answers and the round's own track/artist name)
-- was gated on game_rounds.ended_at IS NOT NULL, but ended_at doesn't
-- actually get set that promptly for a round that times out naturally.
--
-- revealActive (client) starts the instant a round's timer expires, but
-- gameStatus only becomes "between_rounds" after the full 3s reveal window
-- (REVEAL_MS) finishes, and advance_game_round() -- the only thing that
-- sets ended_at for a natural timeout -- only runs once gameStatus is
-- "between_rounds". So for the entire reveal window, ended_at is still
-- NULL, and reveal correctly (by that rule) shows nothing. It only worked
-- when every player answered early, since apply_answer_side_effects() sets
-- ended_at immediately in that specific case -- hence "works sometimes,
-- fails most times."
--
-- Fix: also accept "the round's own timer has genuinely expired," checked
-- with the database's own clock (now() >= started_at + time_per_round) --
-- just as server-authoritative as ended_at, since it's evaluated in
-- Postgres, not reported by any client.

DROP POLICY IF EXISTS "Own answer always, full room after reveal" ON public.player_answers;
CREATE POLICY "Own answer always, full room after reveal"
  ON public.player_answers FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR (
      EXISTS (SELECT 1 FROM public.room_players rp WHERE rp.room_id = player_answers.room_id AND rp.player_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.game_rounds gr
        JOIN public.game_rooms rm ON rm.id = gr.room_id
        WHERE gr.id = player_answers.round_id
          AND (
            gr.ended_at IS NOT NULL
            OR now() >= gr.started_at + make_interval(secs => COALESCE(rm.time_per_round, 15))
          )
      )
    )
  );

DROP VIEW IF EXISTS public.game_rounds_public;
CREATE VIEW public.game_rounds_public AS
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
    WHEN r.ended_at IS NOT NULL
      OR now() >= r.started_at + make_interval(secs => COALESCE(rm.time_per_round, 15))
      THEN r.track_name
    WHEN rm.host_id = auth.uid() THEN r.track_name
    ELSE NULL
  END AS track_name,
  CASE
    WHEN r.ended_at IS NOT NULL
      OR now() >= r.started_at + make_interval(secs => COALESCE(rm.time_per_round, 15))
      THEN r.artist_name
    WHEN rm.host_id = auth.uid() THEN r.artist_name
    ELSE NULL
  END AS artist_name
FROM public.game_rounds r
JOIN public.game_rooms rm ON rm.id = r.room_id
WHERE
  EXISTS (SELECT 1 FROM public.room_players rp WHERE rp.room_id = r.room_id AND rp.player_id = auth.uid())
  OR rm.host_id = auth.uid();

GRANT SELECT ON public.game_rounds_public TO authenticated;
