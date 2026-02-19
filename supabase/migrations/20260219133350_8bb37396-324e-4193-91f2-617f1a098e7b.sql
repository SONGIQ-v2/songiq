
-- Drop the restrictive SELECT policy
DROP POLICY "Players can view own answers or completed round answers" ON public.player_answers;

-- Create a new policy that allows players in the same room to see all answers for that room
CREATE POLICY "Room players can view answers in their room"
ON public.player_answers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM room_players
    WHERE room_players.room_id = player_answers.room_id
    AND room_players.player_id = auth.uid()
  )
);
