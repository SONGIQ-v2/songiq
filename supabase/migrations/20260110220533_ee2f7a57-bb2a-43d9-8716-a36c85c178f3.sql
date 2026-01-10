-- Create game_rooms table for multiplayer
CREATE TABLE public.game_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code VARCHAR(6) NOT NULL UNIQUE,
  host_id UUID NOT NULL,
  host_name VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  category VARCHAR(50) NOT NULL DEFAULT 'afrobeats',
  max_players INTEGER NOT NULL DEFAULT 8,
  current_round INTEGER NOT NULL DEFAULT 0,
  total_rounds INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE
);

-- Create room_players table
CREATE TABLE public.room_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name VARCHAR(50) NOT NULL,
  avatar_index INTEGER NOT NULL DEFAULT 1,
  score INTEGER NOT NULL DEFAULT 0,
  is_host BOOLEAN NOT NULL DEFAULT false,
  is_ready BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(room_id, player_id)
);

-- Create game_rounds table for tracking round data
CREATE TABLE public.game_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  track_id VARCHAR(100) NOT NULL,
  track_name VARCHAR(255) NOT NULL,
  artist_name VARCHAR(255) NOT NULL,
  preview_url TEXT NOT NULL,
  options JSONB NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(room_id, round_number)
);

-- Create player_answers table
CREATE TABLE public.player_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  answer VARCHAR(255) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  points_earned INTEGER NOT NULL DEFAULT 0,
  answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(round_id, player_id)
);

-- Enable RLS
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_answers ENABLE ROW LEVEL SECURITY;

-- RLS policies for game_rooms (public access for multiplayer)
CREATE POLICY "Anyone can view rooms" ON public.game_rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create rooms" ON public.game_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Host can update room" ON public.game_rooms FOR UPDATE USING (true);
CREATE POLICY "Host can delete room" ON public.game_rooms FOR DELETE USING (true);

-- RLS policies for room_players
CREATE POLICY "Anyone can view players" ON public.room_players FOR SELECT USING (true);
CREATE POLICY "Anyone can join room" ON public.room_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players can update their data" ON public.room_players FOR UPDATE USING (true);
CREATE POLICY "Players can leave room" ON public.room_players FOR DELETE USING (true);

-- RLS policies for game_rounds
CREATE POLICY "Anyone can view rounds" ON public.game_rounds FOR SELECT USING (true);
CREATE POLICY "Host can create rounds" ON public.game_rounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Host can update rounds" ON public.game_rounds FOR UPDATE USING (true);

-- RLS policies for player_answers
CREATE POLICY "Anyone can view answers" ON public.player_answers FOR SELECT USING (true);
CREATE POLICY "Players can submit answers" ON public.player_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Answers can be updated" ON public.player_answers FOR UPDATE USING (true);

-- Enable realtime for multiplayer sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_answers;