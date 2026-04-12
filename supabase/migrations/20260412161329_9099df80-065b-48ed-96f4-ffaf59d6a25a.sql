
-- 1. Enforce is_host flag: only the room's actual host can have is_host=true
CREATE OR REPLACE FUNCTION public.enforce_is_host()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_host = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE id = NEW.room_id AND host_id = NEW.player_id
    ) THEN
      RAISE EXCEPTION 'Only the room host can have is_host=true';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER check_is_host
  BEFORE INSERT OR UPDATE ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.enforce_is_host();

-- 2. Validate player names server-side (1-20 chars, no control chars)
CREATE OR REPLACE FUNCTION public.validate_player_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.player_name := trim(NEW.player_name);
  IF length(NEW.player_name) < 1 OR length(NEW.player_name) > 20 THEN
    RAISE EXCEPTION 'Player name must be 1-20 characters';
  END IF;
  IF NEW.player_name ~ E'[\\x00-\\x1F\\x7F]' THEN
    RAISE EXCEPTION 'Player name contains invalid characters';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_room_players_name
  BEFORE INSERT OR UPDATE ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.validate_player_name();

-- 3. Validate host names server-side
CREATE OR REPLACE FUNCTION public.validate_host_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.host_name := trim(NEW.host_name);
  IF length(NEW.host_name) < 1 OR length(NEW.host_name) > 20 THEN
    RAISE EXCEPTION 'Host name must be 1-20 characters';
  END IF;
  IF NEW.host_name ~ E'[\\x00-\\x1F\\x7F]' THEN
    RAISE EXCEPTION 'Host name contains invalid characters';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_game_rooms_host_name
  BEFORE INSERT OR UPDATE ON public.game_rooms
  FOR EACH ROW EXECUTE FUNCTION public.validate_host_name();

-- 4. Tighten game_rounds SELECT: require authentication
DROP POLICY IF EXISTS "Players can view completed rounds or their room rounds" ON public.game_rounds;
CREATE POLICY "Players can view completed rounds or their room rounds" ON public.game_rounds
  FOR SELECT TO authenticated
  USING (
    (ended_at IS NOT NULL) OR 
    (EXISTS (
      SELECT 1 FROM public.room_players
      WHERE room_players.room_id = game_rounds.room_id
        AND room_players.player_id = auth.uid()
    ))
  );

-- 5. Tighten room_players SELECT: require authentication
DROP POLICY IF EXISTS "Anyone can view players" ON public.room_players;
CREATE POLICY "Authenticated users can view players" ON public.room_players
  FOR SELECT TO authenticated
  USING (true);

-- 6. Tighten game_rooms SELECT: require authentication
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.game_rooms;
CREATE POLICY "Authenticated users can view rooms" ON public.game_rooms
  FOR SELECT TO authenticated
  USING (true);
