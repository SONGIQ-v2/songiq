-- Transfer an anonymous player's points/streak/nickname into their Google
-- account the moment they sign in.
--
-- Google sign-in today is a full session SWAP (setSession() to a brand-new
-- Supabase user), not linkIdentity() -- so without this, everything earned
-- while anonymous stays orphaned under the old, abandoned UUID.
--
-- player_id is public (shown on the leaderboard), so a naive merge(old, new)
-- RPC would let anyone move data by supplying someone else's id. Both ends
-- are proven via each session's own auth.uid() instead, bridged by a
-- short-lived single-use token -- mirrors how record_game_session() already
-- trusts auth.uid() over any client-supplied id.

CREATE TABLE public.merge_requests (
  token UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  anonymous_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '15 minutes'
);

ALTER TABLE public.merge_requests ENABLE ROW LEVEL SECURITY;
-- No policies -- written/read only via the SECURITY DEFINER functions below,
-- same pattern as play_sessions/points_log.

-- Rebuilds daily_stats for one player from scratch by replaying their full
-- daily_attempts history in date order, using the same consecutive-day rule
-- as apply_daily_attempt()'s trigger. Used after merge_player_data() combines
-- two players' attempt histories, where hand-merging the two aggregate rows
-- could get a streak spanning both identities wrong.
CREATE OR REPLACE FUNCTION public.recompute_daily_stats(p_player_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_prev_date DATE;
  v_streak INT := 0;
  v_best INT := 0;
  v_total BIGINT := 0;
  v_plays INT := 0;
  v_name TEXT;
  v_last DATE;
BEGIN
  DELETE FROM daily_stats WHERE player_id = p_player_id;

  FOR v_row IN
    SELECT * FROM daily_attempts WHERE player_id = p_player_id ORDER BY challenge_date ASC
  LOOP
    IF v_prev_date IS NOT NULL AND v_row.challenge_date = v_prev_date + 1 THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;
    v_best := GREATEST(v_best, v_streak);
    v_total := v_total + v_row.score;
    v_plays := v_plays + 1;
    v_name := v_row.player_name;
    v_last := v_row.challenge_date;
    v_prev_date := v_row.challenge_date;
  END LOOP;

  IF v_plays > 0 THEN
    INSERT INTO daily_stats (player_id, player_name, current_streak, best_streak, total_score, plays, last_played)
    VALUES (p_player_id, v_name, v_streak, v_best, v_total, v_plays, v_last);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_daily_stats(UUID) FROM PUBLIC, anon, authenticated;

-- The actual data move. Internal only -- callers must go through
-- claim_anonymous_merge() so v_old/v_new are always proven via auth.uid(),
-- never taken as client-supplied parameters.
CREATE OR REPLACE FUNCTION public.merge_player_data(v_old UUID, v_new UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_points player_points%ROWTYPE;
BEGIN
  -- Append-only ledgers -- no conflicts possible, just reassign.
  UPDATE points_log SET player_id = v_new WHERE player_id = v_old;
  UPDATE play_sessions SET player_id = v_new WHERE player_id = v_old;

  -- Lifetime totals: sum in, preferring the anonymous player's own chosen
  -- nickname (the one they actually played under) over whatever's already
  -- on the destination account.
  SELECT * INTO v_old_points FROM player_points WHERE player_id = v_old;
  IF FOUND THEN
    INSERT INTO player_points (player_id, player_name, points, games, updated_at)
    VALUES (v_new, v_old_points.player_name, v_old_points.points, v_old_points.games, now())
    ON CONFLICT (player_id) DO UPDATE SET
      player_name = COALESCE(v_old_points.player_name, player_points.player_name),
      points = player_points.points + v_old_points.points,
      games = player_points.games + v_old_points.games,
      updated_at = now();
    DELETE FROM player_points WHERE player_id = v_old;
  END IF;

  -- Daily attempts: one per day is already enforced app-wide, so a same-day
  -- collision means the destination's own attempt wins -- move everything
  -- else, drop what's left unmerged.
  UPDATE daily_attempts SET player_id = v_new
  WHERE player_id = v_old
    AND challenge_date NOT IN (
      SELECT challenge_date FROM daily_attempts WHERE player_id = v_new
    );
  DELETE FROM daily_attempts WHERE player_id = v_old;

  PERFORM public.recompute_daily_stats(v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_player_data(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Called while still anonymous, right before starting the Google OAuth
-- flow. Returns a token identifying *this* anonymous session -- never
-- accepts an id from the client.
CREATE OR REPLACE FUNCTION public.stage_anonymous_merge()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_anon BOOLEAN;
  v_token UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT (auth.jwt() ->> 'is_anonymous')::boolean INTO v_is_anon;
  IF NOT coalesce(v_is_anon, false) THEN
    RETURN NULL; -- already a real account, nothing to stage
  END IF;

  DELETE FROM merge_requests WHERE expires_at < now(); -- opportunistic sweep
  DELETE FROM merge_requests WHERE anonymous_id = v_uid; -- one live token per anon id

  INSERT INTO merge_requests (anonymous_id) VALUES (v_uid) RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.stage_anonymous_merge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_anonymous_merge() TO authenticated;

-- Called once the new (Google) session is active. Only merges INTO a real,
-- signed-in identity, and only consumes a token that was staged by that
-- exact anonymous session -- both proven via auth.uid(), not the token
-- payload alone (the token's only job is bridging the redirect).
CREATE OR REPLACE FUNCTION public.claim_anonymous_merge(p_token UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new UUID := auth.uid();
  v_new_is_anon BOOLEAN;
  v_old UUID;
BEGIN
  IF v_new IS NULL OR p_token IS NULL THEN
    RETURN;
  END IF;

  SELECT (auth.jwt() ->> 'is_anonymous')::boolean INTO v_new_is_anon;
  IF coalesce(v_new_is_anon, false) THEN
    RETURN; -- only merge into a real, signed-in identity
  END IF;

  DELETE FROM merge_requests WHERE expires_at < now();

  SELECT anonymous_id INTO v_old FROM merge_requests WHERE token = p_token;
  IF v_old IS NULL OR v_old = v_new THEN
    RETURN; -- unknown/expired/already-consumed token, or no-op self-merge
  END IF;

  DELETE FROM merge_requests WHERE token = p_token; -- single-use

  -- Only ever merge into a brand-new account -- once v_new has its own
  -- history (from any device, any prior sign-in), it's an established
  -- identity and no later anonymous session should be pooled into it (e.g.
  -- someone else playing anonymously on a shared/borrowed device after the
  -- owner signs out). The anonymous session's data is simply left as-is.
  IF EXISTS (SELECT 1 FROM player_points WHERE player_id = v_new) THEN
    RETURN;
  END IF;

  PERFORM public.merge_player_data(v_old, v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_anonymous_merge(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_anonymous_merge(UUID) TO authenticated;
