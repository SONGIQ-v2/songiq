
-- Allow host to delete old rounds when resetting a room
CREATE POLICY "Host can delete rounds in own room"
ON public.game_rounds
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM game_rooms
  WHERE game_rooms.id = game_rounds.room_id
  AND game_rooms.host_id = auth.uid()
));

-- Allow host to delete old answers when resetting a room
CREATE POLICY "Host can delete answers in own room"
ON public.player_answers
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM game_rooms
  WHERE game_rooms.id = player_answers.room_id
  AND game_rooms.host_id = auth.uid()
));

-- Allow host to reset all players' scores (not just their own)
CREATE POLICY "Host can update players in own room"
ON public.room_players
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM game_rooms
  WHERE game_rooms.id = room_players.room_id
  AND game_rooms.host_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM game_rooms
  WHERE game_rooms.id = room_players.room_id
  AND game_rooms.host_id = auth.uid()
));
