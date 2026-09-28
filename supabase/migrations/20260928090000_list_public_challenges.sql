-- Public "Browse Challenges" feed: lists recently created challenges so a
-- visitor sees social proof of active competition instead of defaulting to
-- solo play. challenges.SELECT RLS is locked to "your own creations" (see
-- 20260826090000_stop_listing_every_challenge.sql) specifically because the
-- old open policy let any client bulk-dump every challenge's `plan` column
-- (the quiz rounds AND correct answers) -- this RPC mirrors that migration's
-- get_challenge_by_code() pattern (SECURITY DEFINER, granted to anon +
-- authenticated) but never selects `plan` itself, only a safe metadata
-- subset, so the answer-scraping concern that locked the table down stays
-- closed while challenges become browsable.

CREATE OR REPLACE FUNCTION public.list_public_challenges(p_limit int, p_offset int)
RETURNS TABLE (
  code varchar(8),
  creator_id uuid,
  creator_name varchar(50),
  category_name varchar(100),
  time_per_round int,
  song_count int,
  attempt_count bigint,
  top_name varchar(50),
  top_score int,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.code, c.creator_id, c.creator_name,
    c.category_name, c.time_per_round,
    CASE WHEN jsonb_typeof(c.plan) = 'array' THEN jsonb_array_length(c.plan) ELSE 0 END AS song_count,
    (SELECT count(*) FROM public.challenge_attempts a WHERE a.challenge_code = c.code) AS attempt_count,
    -- The current leader isn't always the creator -- someone may have beaten
    -- them since. Fall back to the creator's own score/name only when nobody
    -- has topped it (or nobody's played yet).
    COALESCE(top.player_name, c.creator_name) AS top_name,
    COALESCE(top.score, c.creator_score) AS top_score,
    c.created_at
  FROM public.challenges c
  LEFT JOIN LATERAL (
    SELECT a.player_name, a.score
    FROM public.challenge_attempts a
    WHERE a.challenge_code = c.code AND a.score > c.creator_score
    ORDER BY a.score DESC
    LIMIT 1
  ) top ON true
  WHERE jsonb_typeof(c.plan) = 'array' AND jsonb_array_length(c.plan) > 0
    -- A challenge link is created silently in the background the instant
    -- results appear (Game.tsx/MultiplayerGame.tsx), regardless of whether
    -- the player ever taps Share -- so most rows here were never actually
    -- shared with anyone. Only show ones someone else has actually played:
    -- the creator's own score lives on creator_score, never a
    -- challenge_attempts row, so this can't match the creator's own play.
    AND EXISTS (SELECT 1 FROM public.challenge_attempts a WHERE a.challenge_code = c.code)
  ORDER BY c.created_at DESC
  LIMIT LEAST(p_limit, 50)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_challenges(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_challenges(int, int) TO anon, authenticated;
