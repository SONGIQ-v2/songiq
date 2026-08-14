-- Host handoff: an explicit leave promotes the earliest-joined remaining
-- player instead of deleting the room outright, and a Presence-triggered
-- path recovers rooms whose host silently disconnected (closed tab, crash,
-- lost connection) without ever calling leave.
--
-- Both paths run as SECURITY DEFINER RPCs (mirrors advance_game_round()):
-- game_rooms' UPDATE policy requires auth.uid() = host_id in the WITH CHECK
-- clause, so no client -- not even the outgoing host -- can ever reassign
-- host_id to someone else via a plain table update. A privileged function is
-- the only way to hand off ownership.

-- Heartbeat: refreshed by each player's own client every ~15s while mounted
-- in the room. Already writable by the player themselves under the existing
-- "Players can update their own data" policy (auth.uid() = player_id) -- no
-- new RLS needed. This is the ground truth transfer_host_if_inactive() checks
-- before acting, so a transient Presence blip alone can never steal an
-- actually-connected host.
ALTER TABLE public.room_players
  ADD COLUMN last_seen timestamptz NOT NULL DEFAULT now();

-- ----------------------------------------------------------------------------
-- Explicit leave, with host handoff
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_room_with_handoff(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_next room_players%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM room_players WHERE room_id = p_room_id AND player_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of this room';
  END IF;

  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'room_not_found');
  END IF;

  DELETE FROM room_players WHERE room_id = p_room_id AND player_id = auth.uid();

  IF v_room.host_id <> auth.uid() THEN
    RETURN jsonb_build_object('status', 'left');
  END IF;

  -- Departing player was the host -- hand off to whoever joined earliest.
  SELECT * INTO v_next FROM room_players
  WHERE room_id = p_room_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    DELETE FROM game_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object('status', 'room_closed');
  END IF;

  UPDATE game_rooms SET host_id = v_next.player_id, host_name = v_next.player_name
  WHERE id = p_room_id;
  UPDATE room_players SET is_host = true
  WHERE room_id = p_room_id AND player_id = v_next.player_id;

  RETURN jsonb_build_object(
    'status', 'handed_off',
    'new_host_id', v_next.player_id,
    'new_host_name', v_next.player_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leave_room_with_handoff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_room_with_handoff(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Presence-triggered recovery: a remaining player calls this once Realtime
-- Presence shows the host's connection has dropped. Re-verified here against
-- last_seen -- the sole DB-observable, unspoofable-by-a-single-client signal
-- -- so a lone Presence blip (or a misbehaving client) can never take the
-- host away from someone who is actually still connected.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_host_if_inactive(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_host room_players%ROWTYPE;
  v_next room_players%ROWTYPE;
  v_stale_after CONSTANT interval := interval '40 seconds';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM room_players WHERE room_id = p_room_id AND player_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of this room';
  END IF;

  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'room_not_found');
  END IF;

  SELECT * INTO v_host FROM room_players
  WHERE room_id = p_room_id AND player_id = v_room.host_id;

  -- Host already gone from room_players, or their heartbeat is stale.
  IF FOUND AND v_host.last_seen >= now() - v_stale_after THEN
    RETURN jsonb_build_object('status', 'host_active');
  END IF;

  SELECT * INTO v_next FROM room_players
  WHERE room_id = p_room_id AND player_id <> v_room.host_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_other_players');
  END IF;

  UPDATE game_rooms SET host_id = v_next.player_id, host_name = v_next.player_name
  WHERE id = p_room_id;
  UPDATE room_players SET is_host = false
  WHERE room_id = p_room_id AND player_id = v_room.host_id;
  UPDATE room_players SET is_host = true
  WHERE room_id = p_room_id AND player_id = v_next.player_id;

  RETURN jsonb_build_object(
    'status', 'handed_off',
    'new_host_id', v_next.player_id,
    'new_host_name', v_next.player_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_host_if_inactive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_host_if_inactive(uuid) TO authenticated;
