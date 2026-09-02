-- Permanent (30-day) record of which rooms were created and who joined them,
-- for the admin Multiplayer tab. game_rooms/room_players get deleted by
-- cleanup-stale-rooms within 15min-2h of going stale (room_players cascades
-- off game_rooms.id), so there's currently no way to look back at "which
-- rooms were created this week and who joined them" -- creation_log proves a
-- room existed but discards the room code and participant list.
--
-- room_id here is a plain column, NOT a cascading FK to game_rooms.id -- the
-- entire point is that this data must survive after the live room is deleted.
CREATE TABLE public.room_archive (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL,
  room_code VARCHAR(6) NOT NULL,
  host_id UUID NOT NULL,
  host_name VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX room_archive_room_id_idx ON public.room_archive (room_id);
CREATE INDEX room_archive_created_at_idx ON public.room_archive (created_at);

ALTER TABLE public.room_archive ENABLE ROW LEVEL SECURITY;
-- No policies -- service-role only (admin-analytics), same as creation_log.
REVOKE ALL ON public.room_archive FROM PUBLIC, anon, authenticated;

-- The FK here is internal to the archive itself (room_archive is never
-- deleted by cleanup-stale-rooms, only by this table's own 30-day purge
-- below) -- deleting an old room_archive row cascades to its own player
-- rows, which is fine and intentional.
CREATE TABLE public.room_player_archive (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.room_archive(room_id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name VARCHAR(50) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL,
  UNIQUE(room_id, player_id)
);
CREATE INDEX room_player_archive_room_id_idx ON public.room_player_archive (room_id);

ALTER TABLE public.room_player_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_player_archive FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.archive_room_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.room_archive (room_id, room_code, host_id, host_name, category, created_at)
  VALUES (NEW.id, NEW.room_code, NEW.host_id, NEW.host_name, NEW.category, NEW.created_at)
  ON CONFLICT (room_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_archive_room_created
AFTER INSERT ON public.game_rooms
FOR EACH ROW EXECUTE FUNCTION public.archive_room_created();

-- Fires once per genuine join (including the host, since hosting a room also
-- inserts a room_players row) and is unaffected by a player later leaving
-- (no UPDATE/DELETE trigger) -- this answers "who ever joined," not "who's
-- currently in the room." No FK-ordering issue: a room_players row can't be
-- inserted before its game_rooms row exists (enforced by room_players' own
-- FK), so the matching room_archive row is always already there.
CREATE OR REPLACE FUNCTION public.archive_room_player_joined()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.room_player_archive (room_id, player_id, player_name, joined_at)
  VALUES (NEW.room_id, NEW.player_id, NEW.player_name, NEW.joined_at)
  ON CONFLICT (room_id, player_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_archive_room_player_joined
AFTER INSERT ON public.room_players
FOR EACH ROW EXECUTE FUNCTION public.archive_room_player_joined();
