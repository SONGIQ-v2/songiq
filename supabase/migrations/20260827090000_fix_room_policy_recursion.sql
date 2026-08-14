-- Fix infinite recursion (42P17) introduced by
-- 20260823090000_stop_listing_every_room.sql: game_rooms' SELECT policy
-- checked room_players via a subquery, and room_players' SELECT policy
-- checked game_rooms via a subquery -- each cross-table check triggers the
-- other table's own RLS evaluation, which triggers the first one's again.
-- This didn't exist before because both policies used to be a bare
-- USING (true), with no subquery to recurse through.
--
-- Fix: route both through is_room_participant() (defined in
-- 20260824090000_gate_realtime_to_members.sql) instead of inline
-- subqueries. It's SECURITY DEFINER, so its internal lookups against
-- room_players/game_rooms run as the function owner and bypass RLS
-- entirely -- no recursive policy evaluation is triggered.

DROP POLICY IF EXISTS "Room members can view their rooms" ON public.game_rooms;
CREATE POLICY "Room members can view their rooms"
  ON public.game_rooms FOR SELECT TO authenticated
  USING (public.is_room_participant(id));

DROP POLICY IF EXISTS "Room members can view players in their rooms" ON public.room_players;
CREATE POLICY "Room members can view players in their rooms"
  ON public.room_players FOR SELECT TO authenticated
  USING (public.is_room_participant(room_id));
