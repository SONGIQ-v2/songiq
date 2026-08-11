-- Follow-up to 20260817090000: that fixed the duplicate-overload ambiguity,
-- but surfaced the real underlying mismatch -- settle_room_points()'s
-- round(v_row.score / 100.0)::int + 5 * v_row.beaten evaluates to BIGINT
-- (v_row.beaten comes from COUNT(*), always bigint in Postgres; int + bigint
-- promotes the whole sum), while add_player_points declared that parameter
-- as plain INTEGER. Widening to BIGINT also matches player_points.points'
-- actual column type, so nothing narrows anywhere in this call chain.
--
-- Changing a parameter's type creates yet another distinct overload rather
-- than replacing in place (same reason as before), so the INTEGER version
-- must be dropped explicitly.

DROP FUNCTION IF EXISTS public.add_player_points(UUID, TEXT, INTEGER, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.add_player_points(
  p_player_id UUID,
  p_name TEXT,
  p_points BIGINT,
  p_count_game BOOLEAN DEFAULT TRUE,
  p_source TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points BIGINT := GREATEST(0, p_points);
  v_target_is_anon BOOLEAN;
BEGIN
  SELECT is_anonymous INTO v_target_is_anon FROM auth.users WHERE id = p_player_id;

  INSERT INTO player_points (player_id, player_name, points, games, updated_at)
  VALUES (p_player_id, NULLIF(trim(coalesce(p_name, '')), ''), v_points, CASE WHEN p_count_game THEN 1 ELSE 0 END, now())
  ON CONFLICT (player_id) DO UPDATE SET
    player_name = CASE
      WHEN coalesce(v_target_is_anon, true)
        THEN COALESCE(NULLIF(trim(coalesce(EXCLUDED.player_name, '')), ''), player_points.player_name)
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

REVOKE ALL ON FUNCTION public.add_player_points(UUID, TEXT, BIGINT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
