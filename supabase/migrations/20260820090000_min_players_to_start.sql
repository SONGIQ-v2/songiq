-- Enforce the 2-player minimum to start a game at the database level.
-- startGame() in useMultiplayerGame.ts only checked `isHost` before flipping
-- game_rooms.status to 'playing' -- the "need at least 2 players" rule was
-- purely a disabled Start Game button client-side. Anyone issuing the same
-- update directly (devtools, a raw API call) could start solo. Extending
-- the host's existing UPDATE policy closes this for every code path, not
-- just the normal UI one.
--
-- Scoped to the 'playing' transition specifically: any other host update
-- (settings while still 'waiting', ending the game via 'finished', a
-- play-again reset back to 'waiting') is untouched.
DROP POLICY IF EXISTS "Host can update own room" ON public.game_rooms;
CREATE POLICY "Host can update own room"
  ON public.game_rooms FOR UPDATE TO authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (
    auth.uid() = host_id
    AND (
      status <> 'playing'
      OR (SELECT count(*) FROM public.room_players WHERE room_players.room_id = game_rooms.id) >= 2
    )
  );
