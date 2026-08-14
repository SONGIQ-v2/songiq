-- Enforce game_rooms.max_players at the database level. Nothing previously
-- capped room_players inserts -- the "X/25" count on RoomLobby was display
-- only, so any number of guests could keep joining past the configured
-- limit. This is the single choke point every join path (the room-code
-- form, a shared room link, and any future one) goes through, so it can't
-- be bypassed the way a per-page client-side check could.
DROP POLICY IF EXISTS "Authenticated users can join rooms" ON public.room_players;
CREATE POLICY "Authenticated users can join rooms"
  ON public.room_players FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND (
      SELECT count(*) FROM public.room_players rp WHERE rp.room_id = room_players.room_id
    ) < (
      SELECT max_players FROM public.game_rooms WHERE id = room_players.room_id
    )
  );
