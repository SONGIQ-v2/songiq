-- Nickname becomes a real, DB-backed username for signed-in accounts.
--
-- Today, nickname is entirely session/localStorage-driven, even once signed
-- in: playing anonymously sets localStorage, and signing in only adopts the
-- account's name if nothing local is already known -- so a nickname picked
-- up while playing anonymously on a shared/borrowed device (or just after
-- signing out) silently overwrites a real account's name the next time it
-- plays a game (add_player_points always preferred the incoming client
-- name). Separately, the leaderboard's displayed name actually comes from
-- the most recent play_sessions.player_name, not player_points.player_name
-- at all -- so locking down player_points alone wouldn't even fix what's
-- shown. This migration makes a signed-in account's name changeable only
-- through an explicit rename, everywhere it's stored.

-- ---- 1. Explicit rename path ----
-- Reuses the existing validate_player_name() trigger (attached below) for
-- length/character rules instead of duplicating them here.
CREATE OR REPLACE FUNCTION public.set_nickname(p_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_anon BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (auth.jwt() ->> 'is_anonymous')::boolean INTO v_is_anon;
  IF coalesce(v_is_anon, false) THEN
    RAISE EXCEPTION 'Sign in to set a permanent nickname';
  END IF;

  INSERT INTO player_points (player_id, player_name, points, games, updated_at)
  VALUES (v_uid, p_name, 0, 0, now())
  ON CONFLICT (player_id) DO UPDATE SET player_name = p_name, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_nickname(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_nickname(TEXT) TO authenticated;

-- Retiring claim_anonymous_merge() (from 20260813090000_anonymous_merge.sql)
-- in favor of resolve_signin_identity() below. Two independent client
-- listeners each writing to player_points off the same sign-in event (one
-- to auto-bootstrap a name, one to claim a merge) raced each other with no
-- way to guarantee ordering -- whichever won could wrongly decide the
-- account was "already established" and skip the one-time merge, or
-- clobber a merge that had just completed. A single sequential function,
-- called from exactly one place, removes the race instead of tolerating it.
DROP FUNCTION IF EXISTS public.claim_anonymous_merge(UUID);

-- The one and only place a signed-in account's identity gets established.
-- Called once per real sign-in transition (see gameStore.ts). Strictly
-- one-time: once player_points has ANY row for this account, this is a
-- pure read for the rest of that account's life -- no future sign-in, on
-- any device, staged token or not, ever merges or renames it again.
CREATE OR REPLACE FUNCTION public.resolve_signin_identity(p_token UUID, p_fallback_name TEXT)
RETURNS TABLE (player_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new UUID := auth.uid();
  v_new_is_anon BOOLEAN;
  v_old UUID;
BEGIN
  IF v_new IS NULL THEN
    RETURN;
  END IF;

  SELECT (auth.jwt() ->> 'is_anonymous')::boolean INTO v_new_is_anon;
  IF coalesce(v_new_is_anon, false) THEN
    RETURN;
  END IF;

  IF p_token IS NOT NULL THEN
    DELETE FROM merge_requests WHERE expires_at < now();
    SELECT anonymous_id INTO v_old FROM merge_requests WHERE token = p_token;
    DELETE FROM merge_requests WHERE token = p_token; -- single-use, consumed regardless of outcome
    IF v_old = v_new THEN
      v_old := NULL; -- no-op self-merge
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM player_points WHERE player_id = v_new) THEN
    -- First-ever sign-in for this account -- the one and only moment a
    -- merge or a fresh bootstrap can happen.
    IF v_old IS NOT NULL THEN
      PERFORM public.merge_player_data(v_old, v_new);
    ELSE
      INSERT INTO player_points (player_id, player_name, points, games, updated_at)
      VALUES (v_new, p_fallback_name, 0, 0, now())
      ON CONFLICT (player_id) DO NOTHING; -- defense in depth against a genuine double-call
    END IF;
  END IF;

  RETURN QUERY SELECT pp.player_name FROM player_points pp WHERE pp.player_id = v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_signin_identity(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_signin_identity(UUID, TEXT) TO authenticated;

CREATE TRIGGER validate_player_points_name
  BEFORE INSERT OR UPDATE ON public.player_points
  FOR EACH ROW EXECUTE FUNCTION public.validate_player_name();

-- ---- 2. Gameplay can no longer rename a real account ----
-- is_anonymous must be looked up for the *target* p_player_id via
-- auth.users, not auth.uid()/auth.jwt() -- those reflect the *caller*,
-- which is wrong here: settle_room_points/settle_daily_bonus award many
-- players' points on behalf of whoever triggered the finish, not each
-- player themselves.
CREATE OR REPLACE FUNCTION public.add_player_points(
  p_player_id UUID,
  p_name TEXT,
  p_points INTEGER,
  p_count_game BOOLEAN DEFAULT TRUE,
  p_source TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER := GREATEST(0, p_points);
  v_target_is_anon BOOLEAN;
BEGIN
  SELECT is_anonymous INTO v_target_is_anon FROM auth.users WHERE id = p_player_id;

  INSERT INTO player_points (player_id, player_name, points, games, updated_at)
  VALUES (p_player_id, NULLIF(trim(coalesce(p_name, '')), ''), v_points, CASE WHEN p_count_game THEN 1 ELSE 0 END, now())
  ON CONFLICT (player_id) DO UPDATE SET
    player_name = CASE
      -- Anonymous players have no durable account -- gameplay is still
      -- their only way to set a display name, unchanged from before.
      WHEN coalesce(v_target_is_anon, true)
        THEN COALESCE(NULLIF(trim(coalesce(EXCLUDED.player_name, '')), ''), player_points.player_name)
      -- Signed-in accounts: only set_nickname() may change this now.
      ELSE player_points.player_name
    END,
    points = player_points.points + v_points,
    games = player_points.games + CASE WHEN p_count_game THEN 1 ELSE 0 END,
    updated_at = now();

  IF v_points > 0 THEN
    INSERT INTO points_log (player_id, points, source) VALUES (p_player_id, v_points, p_source);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_points(UUID, TEXT, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

-- ---- 3. Every per-row name snapshot follows the same rule ----
-- play_sessions/daily_attempts/room_players each keep their own
-- player_name snapshot, and global_leaderboard() actually prefers the most
-- recent play_sessions.player_name over player_points.player_name -- so
-- fixing (2) alone wouldn't fix what's displayed. One trigger, reused on
-- all three tables, catches every current and future write path (RPCs and
-- Daily.tsx's raw insert alike) instead of patching each individually.
CREATE OR REPLACE FUNCTION public.enforce_canonical_nickname()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_anon BOOLEAN;
  v_canonical TEXT;
BEGIN
  SELECT is_anonymous INTO v_is_anon FROM auth.users WHERE id = NEW.player_id;
  IF NOT coalesce(v_is_anon, true) THEN
    SELECT player_name INTO v_canonical FROM player_points WHERE player_id = NEW.player_id;
    IF v_canonical IS NOT NULL THEN
      NEW.player_name := v_canonical;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Named to sort alphabetically before validate_*_name triggers already on
-- these tables (Postgres fires same-timing BEFORE triggers in name order,
-- not creation order) -- canonical name gets substituted first, then
-- validated/trimmed as a safe no-op.
CREATE TRIGGER enforce_canonical_nickname_trigger
  BEFORE INSERT ON public.play_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_nickname();

CREATE TRIGGER enforce_canonical_nickname_trigger
  BEFORE INSERT ON public.daily_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_nickname();

CREATE TRIGGER enforce_canonical_nickname_trigger
  BEFORE INSERT ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_nickname();
