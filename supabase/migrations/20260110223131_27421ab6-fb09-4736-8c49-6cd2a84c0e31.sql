-- Drop the permissive UPDATE and DELETE policies
DROP POLICY IF EXISTS "Host can update room" ON public.game_rooms;
DROP POLICY IF EXISTS "Host can delete room" ON public.game_rooms;

-- Create secure policies that verify host ownership via auth.uid()
CREATE POLICY "Host can update own room" ON public.game_rooms 
  FOR UPDATE 
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can delete own room" ON public.game_rooms 
  FOR DELETE 
  USING (auth.uid() = host_id);

-- Also update room_players policies for better security
DROP POLICY IF EXISTS "Players can update their data" ON public.room_players;
DROP POLICY IF EXISTS "Players can leave room" ON public.room_players;

CREATE POLICY "Players can update their own data" ON public.room_players 
  FOR UPDATE 
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Players can leave room" ON public.room_players 
  FOR DELETE 
  USING (auth.uid() = player_id);

-- Update player_answers policies
DROP POLICY IF EXISTS "Answers can be updated" ON public.player_answers;

CREATE POLICY "Players can update their own answers" ON public.player_answers 
  FOR UPDATE 
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);