-- Allow the room host to remove (kick) players from their own room
CREATE POLICY "Host can remove players from own room"
ON public.room_players
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.game_rooms
    WHERE game_rooms.id = room_players.room_id
      AND game_rooms.host_id = auth.uid()
  )
);