-- Gate Realtime room:* broadcasts to actual room participants.
--
-- The private channel's authorization only checked `topic LIKE 'room:%'`
-- -- any authenticated (including anonymous) session could subscribe to
-- room:<any-uuid> and receive every broadcast for that room, without ever
-- having joined. Combined with the previously-open game_rooms listing
-- (now fixed), this meant a stranger could enumerate every live room and
-- eavesdrop on any of them -- including, before this migration's sibling
-- fixes, the round-answer and player-answer broadcasts.

CREATE OR REPLACE FUNCTION public.is_room_participant(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id = p_room_id AND player_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.game_rooms WHERE id = p_room_id AND host_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_room_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS "Room members can receive room broadcasts" ON realtime.messages;
CREATE POLICY "Room members can receive room broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'room:%'
    AND realtime.messages.extension = 'broadcast'
    -- Guard the cast: a malformed/malicious topic shouldn't throw, just
    -- fail closed.
    AND substring(realtime.topic() from 6) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_room_participant(substring(realtime.topic() from 6)::uuid)
  );
