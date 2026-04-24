
-- ============================================================
-- game_rounds: consolidate SELECT policies
-- ============================================================
DROP POLICY IF EXISTS "Host sees all round data in own room" ON public.game_rounds;
DROP POLICY IF EXISTS "Players see completed rounds in their room" ON public.game_rounds;
DROP POLICY IF EXISTS "Players see active rounds in their room" ON public.game_rounds;
DROP POLICY IF EXISTS "Room participants can view rounds" ON public.game_rounds;
DROP POLICY IF EXISTS "Host can create rounds in own room" ON public.game_rounds;
DROP POLICY IF EXISTS "Host can update rounds in own room" ON public.game_rounds;
DROP POLICY IF EXISTS "Host can delete rounds in own room" ON public.game_rounds;

CREATE POLICY "Room participants can view rounds"
  ON public.game_rounds FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.room_players
            WHERE room_players.room_id = game_rounds.room_id
              AND room_players.player_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.game_rooms
               WHERE game_rooms.id = game_rounds.room_id
                 AND game_rooms.host_id = auth.uid())
  );

CREATE POLICY "Host can create rounds in own room"
  ON public.game_rounds FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.game_rooms
                      WHERE game_rooms.id = game_rounds.room_id
                        AND game_rooms.host_id = auth.uid()));

CREATE POLICY "Host can update rounds in own room"
  ON public.game_rounds FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.game_rooms
                 WHERE game_rooms.id = game_rounds.room_id
                   AND game_rooms.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.game_rooms
                      WHERE game_rooms.id = game_rounds.room_id
                        AND game_rooms.host_id = auth.uid()));

CREATE POLICY "Host can delete rounds in own room"
  ON public.game_rounds FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.game_rooms
                 WHERE game_rooms.id = game_rounds.room_id
                   AND game_rooms.host_id = auth.uid()));

-- ============================================================
-- game_rooms: restrict to authenticated
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view rooms" ON public.game_rooms;
DROP POLICY IF EXISTS "Authenticated users can create rooms as host" ON public.game_rooms;
DROP POLICY IF EXISTS "Host can update own room" ON public.game_rooms;
DROP POLICY IF EXISTS "Host can delete own room" ON public.game_rooms;

CREATE POLICY "Authenticated users can view rooms"
  ON public.game_rooms FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create rooms as host"
  ON public.game_rooms FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update own room"
  ON public.game_rooms FOR UPDATE TO authenticated
  USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can delete own room"
  ON public.game_rooms FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

-- ============================================================
-- room_players: restrict to authenticated
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view players" ON public.room_players;
DROP POLICY IF EXISTS "Authenticated users can join rooms" ON public.room_players;
DROP POLICY IF EXISTS "Players can update their own data" ON public.room_players;
DROP POLICY IF EXISTS "Host can update players in own room" ON public.room_players;
DROP POLICY IF EXISTS "Players can leave room" ON public.room_players;

CREATE POLICY "Authenticated users can view players"
  ON public.room_players FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can join rooms"
  ON public.room_players FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Players can update their own data"
  ON public.room_players FOR UPDATE TO authenticated
  USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Host can update players in own room"
  ON public.room_players FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.game_rooms
                 WHERE game_rooms.id = room_players.room_id
                   AND game_rooms.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.game_rooms
                      WHERE game_rooms.id = room_players.room_id
                        AND game_rooms.host_id = auth.uid()));

CREATE POLICY "Players can leave room"
  ON public.room_players FOR DELETE TO authenticated
  USING (auth.uid() = player_id);

-- ============================================================
-- player_answers: restrict to authenticated
-- ============================================================
DROP POLICY IF EXISTS "Room players can view answers in their room" ON public.player_answers;
DROP POLICY IF EXISTS "Players can submit own answers" ON public.player_answers;
DROP POLICY IF EXISTS "Players can update their own answer choice" ON public.player_answers;
DROP POLICY IF EXISTS "Host can update answers in own room" ON public.player_answers;
DROP POLICY IF EXISTS "Host can delete answers in own room" ON public.player_answers;

CREATE POLICY "Room players can view answers in their room"
  ON public.player_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.room_players
                 WHERE room_players.room_id = player_answers.room_id
                   AND room_players.player_id = auth.uid()));

CREATE POLICY "Players can submit own answers"
  ON public.player_answers FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid()
              AND EXISTS (SELECT 1 FROM public.room_players
                          WHERE room_players.room_id = player_answers.room_id
                            AND room_players.player_id = auth.uid()));

CREATE POLICY "Players can update their own answer choice"
  ON public.player_answers FOR UPDATE TO authenticated
  USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Host can update answers in own room"
  ON public.player_answers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.game_rooms
                 WHERE game_rooms.id = player_answers.room_id
                   AND game_rooms.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.game_rooms
                      WHERE game_rooms.id = player_answers.room_id
                        AND game_rooms.host_id = auth.uid()));

CREATE POLICY "Host can delete answers in own room"
  ON public.player_answers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.game_rooms
                 WHERE game_rooms.id = player_answers.room_id
                   AND game_rooms.host_id = auth.uid()));
