-- Supersedes 20260827090000_fix_room_policy_recursion.sql, which fixed the
-- original 42P17 circular-policy recursion (game_rooms <-> room_players
-- each checking the other) but introduced a different, subtler failure:
-- new row violates row-level security policy for table "game_rooms" (42501)
-- on INSERT.
--
-- The remaining problem was is_room_participant() being used as game_rooms'
-- own SELECT policy: its second EXISTS clause queries game_rooms itself --
-- so game_rooms' policy indirectly queried game_rooms, from inside the same
-- table's own INSERT ... RETURNING evaluation. Even through a SECURITY
-- DEFINER function, a table's policy self-referencing the table currently
-- being written to breaks in a way that isn't the same as the earlier
-- straightforward two-table recursion.
--
-- Fix: give game_rooms a policy that never queries game_rooms at all --
-- host_id is checked inline (no function, no subquery), and room_players
-- membership is checked via a new is_room_player() that only ever touches
-- room_players. is_room_participant() (checks both tables) stays in use for
-- room_players' own policy, where self-referencing room_players is fine
-- since a room_players INSERT/SELECT was never the table stuck mid-write.

CREATE OR REPLACE FUNCTION public.is_room_player(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = p_room_id AND player_id = auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_room_player(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_player(uuid) TO authenticated;

DROP POLICY IF EXISTS "Room members can view their rooms" ON public.game_rooms;
CREATE POLICY "Room members can view their rooms"
  ON public.game_rooms FOR SELECT TO authenticated
  USING (
    auth.uid() = host_id
    OR public.is_room_player(id)
  );

DROP POLICY IF EXISTS "Room members can view players in their rooms" ON public.room_players;
CREATE POLICY "Room members can view players in their rooms"
  ON public.room_players FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.is_room_participant(room_id)
  );

-- Capacity check pulled out of the room_players INSERT policy's inline
-- subqueries (from 20260819090000_room_capacity_limit.sql) into its own
-- SECURITY DEFINER function, for the same reason as above -- keep the
-- INSERT WITH CHECK from directly querying game_rooms itself.
CREATE OR REPLACE FUNCTION public.room_has_capacity(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  SELECT max_players INTO v_max FROM public.game_rooms WHERE id = p_room_id;
  IF v_max IS NULL THEN
    RETURN false;
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM public.room_players
  WHERE room_id = p_room_id;
  RETURN v_count < v_max;
END;
$$;

REVOKE ALL ON FUNCTION public.room_has_capacity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_has_capacity(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can join rooms" ON public.room_players;
CREATE POLICY "Authenticated users can join rooms"
  ON public.room_players FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND public.room_has_capacity(room_id)
  );
