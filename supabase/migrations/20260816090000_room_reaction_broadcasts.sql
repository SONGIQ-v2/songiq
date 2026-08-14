-- Lets clients send (not just receive) Broadcast messages on room:* topics,
-- needed for emoji reactions -- an ephemeral, client-to-client message with
-- no database row behind it, unlike every other event on this channel
-- (game_rooms/room_players/game_rounds/player_answers changes), which are
-- all broadcast by a SECURITY DEFINER trigger (broadcast_room_change(), in
-- 20260701120000_multiplayer_sync_overhaul.sql) that bypasses RLS entirely.
-- A direct client channel.send() goes through RLS on realtime.messages like
-- any other insert, and only a SELECT policy existed so far.
--
-- Same authorization model as the existing SELECT policy: room UUIDs are
-- unguessable, and reactions are purely cosmetic/ephemeral, so topic-prefix
-- gating (not per-room membership) is sufficient here too.
CREATE POLICY "Room members can send room broadcasts"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.topic() LIKE 'room:%'
    AND realtime.messages.extension = 'broadcast'
  );
