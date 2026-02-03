-- Fix remaining permissive INSERT policies

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.game_rooms;
DROP POLICY IF EXISTS "Anyone can join room" ON public.room_players;

-- Create secure policy for game_rooms - authenticated users can create rooms with themselves as host
CREATE POLICY "Authenticated users can create rooms as host" ON public.game_rooms
  FOR INSERT
  WITH CHECK (
    auth.uid() = host_id
  );

-- Create secure policy for room_players - authenticated users can join rooms as themselves
CREATE POLICY "Authenticated users can join rooms" ON public.room_players
  FOR INSERT
  WITH CHECK (
    auth.uid() = player_id
  );