-- Fix security issues: game_rounds and player_answers RLS policies

-- Drop existing permissive policies on game_rounds
DROP POLICY IF EXISTS "Host can create rounds" ON public.game_rounds;
DROP POLICY IF EXISTS "Host can update rounds" ON public.game_rounds;
DROP POLICY IF EXISTS "Anyone can view rounds" ON public.game_rounds;

-- Create secure policies for game_rounds
-- Only show round data after the round has ended (prevents answer cheating)
CREATE POLICY "Players can view completed rounds or their room rounds" ON public.game_rounds
  FOR SELECT
  USING (
    ended_at IS NOT NULL 
    OR EXISTS (
      SELECT 1 FROM public.room_players
      WHERE room_players.room_id = game_rounds.room_id
      AND room_players.player_id = auth.uid()
    )
  );

-- Only room host can create rounds
CREATE POLICY "Host can create rounds in own room" ON public.game_rounds
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE game_rooms.id = room_id
      AND game_rooms.host_id = auth.uid()
    )
  );

-- Only room host can update rounds
CREATE POLICY "Host can update rounds in own room" ON public.game_rounds
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE game_rooms.id = room_id
      AND game_rooms.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE game_rooms.id = room_id
      AND game_rooms.host_id = auth.uid()
    )
  );

-- Drop existing permissive policies on player_answers
DROP POLICY IF EXISTS "Anyone can view answers" ON public.player_answers;
DROP POLICY IF EXISTS "Players can submit answers" ON public.player_answers;

-- Create secure policies for player_answers
-- Players can only see their own answers, or answers from completed rounds
CREATE POLICY "Players can view own answers or completed round answers" ON public.player_answers
  FOR SELECT
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.game_rounds
      WHERE game_rounds.id = player_answers.round_id
      AND game_rounds.ended_at IS NOT NULL
    )
  );

-- Players can only submit answers for themselves
CREATE POLICY "Players can submit own answers" ON public.player_answers
  FOR INSERT
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_players
      WHERE room_players.room_id = player_answers.room_id
      AND room_players.player_id = auth.uid()
    )
  );