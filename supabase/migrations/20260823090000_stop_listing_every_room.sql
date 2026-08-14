-- Stop letting any authenticated (including anonymous) session list every
-- live room. game_rooms and room_players both had SELECT USING (true) --
-- literally `select * from game_rooms` dumped every room_code, host_id,
-- and UUID currently in play, which combined with the (also-being-fixed)
-- open Realtime topic policy let a stranger enumerate rooms, subscribe to
-- their broadcasts, and watch the game without ever joining.
--
-- The wrinkle: a brand-new player who has a room_code/link but hasn't
-- joined yet still legitimately needs to look up that ONE room (to show
-- the lobby, validate it's joinable, etc.) before they have a room_players
-- row of their own. RLS can't express "only when you supply the right
-- code" -- policies see row contents, not query parameters -- so that
-- lookup path has to be a dedicated SECURITY DEFINER RPC, not a table
-- policy. Base-table access becomes members/host-only; the code-scoped RPC
-- is the one legitimate way in before that.

DROP POLICY IF EXISTS "Authenticated users can view rooms" ON public.game_rooms;
CREATE POLICY "Room members can view their rooms"
  ON public.game_rooms FOR SELECT TO authenticated
  USING (
    auth.uid() = host_id
    OR EXISTS (SELECT 1 FROM public.room_players rp WHERE rp.room_id = game_rooms.id AND rp.player_id = auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated users can view players" ON public.room_players;
CREATE POLICY "Room members can view players in their rooms"
  ON public.room_players FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.room_players rp2 WHERE rp2.room_id = room_players.room_id AND rp2.player_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.game_rooms gr WHERE gr.id = room_players.room_id AND gr.host_id = auth.uid())
  );

-- Room + its current players in one call, keyed by the human-shareable
-- code -- covers every "look this room up before/without being a member"
-- read path client-side (join-form precheck, the lobby's initial load and
-- its polling fallback, the pre-join capacity check).
CREATE OR REPLACE FUNCTION public.get_room_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_players jsonb;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE room_code = upper(p_code);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(rp) ORDER BY rp.score DESC), '[]'::jsonb)
    INTO v_players
  FROM public.room_players rp
  WHERE rp.room_id = v_room.id;

  RETURN jsonb_build_object('room', to_jsonb(v_room), 'players', v_players);
END;
$$;

REVOKE ALL ON FUNCTION public.get_room_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_by_code(text) TO authenticated;
