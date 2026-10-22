-- Bug fix: a finished multiplayer room could be "started" again and paid out
-- every time, with no songs played.
--
-- A host back in the lobby of a finished room (browser back instead of Play
-- Again) still saw Start Game. startGame() flipped the room to 'playing';
-- advance_game_round() found the last round already done and finished the
-- room again at once; settle_room_points() then paid every player at their
-- unreset scores. One room was paid 50 times in 19 minutes this way (47 of
-- them ~0-second "games" at ~16 points each, for both players).
--
--  1. A finished room can only go back to the lobby ('waiting', which is
--     what Play Again does after clearing rounds and scores) -- never
--     straight back to 'playing'. The app now resets a finished room itself
--     before starting (useMultiplayerGame.ts resetRoomForNewGame).
--  2. A room pays out only when at least one round was played in it. Play
--     Again deletes the old rounds, so any round present belongs to this
--     game; a room finished before round 1 (or never started) pays nothing.

CREATE OR REPLACE FUNCTION public.prevent_finished_room_restart()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'finished' AND NEW.status IS DISTINCT FROM 'finished' AND NEW.status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'Room % has finished; reset it with Play Again before starting a new game', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_finished_room_restart_trigger ON public.game_rooms;
CREATE TRIGGER prevent_finished_room_restart_trigger
  BEFORE UPDATE OF status ON public.game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_finished_room_restart();

-- Same as 20260830110000_multiplayer_lifetime_stats.sql, plus the
-- played-a-round guard at the top.
CREATE OR REPLACE FUNCTION public.settle_room_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seconds INTEGER;
  v_row RECORD;
BEGIN
  IF NEW.started_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM game_rounds WHERE room_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_seconds := CASE
    WHEN NEW.finished_at IS NULL THEN NULL
    ELSE LEAST(3600, GREATEST(5, EXTRACT(EPOCH FROM (NEW.finished_at - NEW.started_at))::int))
  END;

  FOR v_row IN
    SELECT rp.player_id, rp.player_name, rp.score,
           (SELECT count(*) FROM room_players o
             WHERE o.room_id = NEW.id AND o.score < rp.score) AS beaten,
           (SELECT count(*) FROM room_players o
             WHERE o.room_id = NEW.id AND o.score > rp.score) AS beaten_by,
           (SELECT count(*) FROM room_players o
             WHERE o.room_id = NEW.id) AS player_count
    FROM room_players rp
    WHERE rp.room_id = NEW.id
  LOOP
    IF v_seconds IS NOT NULL THEN
      INSERT INTO play_sessions (player_id, player_name, mode, seconds)
      VALUES (v_row.player_id, v_row.player_name, 'multiplayer', v_seconds);
    END IF;
    PERFORM add_player_points(
      v_row.player_id,
      v_row.player_name,
      round(v_row.score / 100.0)::int + 5 * v_row.beaten,
      TRUE,
      'multiplayer'
    );
    INSERT INTO multiplayer_results (room_id, player_id, player_name, score, rank, player_count, won, finished_at)
    VALUES (
      NEW.id, v_row.player_id, v_row.player_name, v_row.score,
      v_row.beaten_by + 1, v_row.player_count, v_row.beaten_by = 0, NEW.finished_at
    )
    ON CONFLICT (room_id, player_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_room_points() FROM PUBLIC, anon, authenticated;
