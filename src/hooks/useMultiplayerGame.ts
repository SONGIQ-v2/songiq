import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic, type AppleMusicTrack } from "@/hooks/useAppleMusic";
import { getPlaylistById, PLAYLISTS } from "@/lib/playlists";
import { toast } from "sonner";
import { logError, logWarn, logInfo } from "@/lib/clientLogger";

export interface MultiplayerPlayer {
  id: string;
  player_id: string;
  player_name: string;
  avatar_index: number;
  score: number;
  is_host: boolean;
  is_ready: boolean;
  previousRank?: number;
  currentRank?: number;
  roundScore?: number;
  hasAnswered?: boolean;
}

export interface RoomData {
  id: string;
  room_code: string;
  host_id: string;
  host_name: string;
  status: string;
  category: string;
  current_round: number;
  total_rounds: number;
  max_players: number;
  time_per_round: number;
}

export interface RoundData {
  id: string;
  room_id: string;
  round_number: number;
  track_id: string;
  track_name: string;
  artist_name: string;
  preview_url: string;
  options: string[];
  started_at: string;
  ended_at: string | null;
  artwork_url?: string;
  question_type?: string;
}

const DEFAULT_ROUND_TIME = 20000; // fallback 20 seconds per round
const BETWEEN_ROUNDS_TIME = 5000; // gap before each round; must match advance_game_round()
const REVEAL_MS = 2000; // after an early all-answered end, keep showing graded feedback
const PRE_GAME_SECONDS = 5;
const QUESTION_TYPES = ["Guess the Artist", "Guess the Song"] as const;
type QuestionType = typeof QUESTION_TYPES[number];

export type MultiplayerGameStatus =
  | "waiting"
  | "pre_game"
  | "playing"
  | "between_rounds"
  | "results"
  | "terminated";

export function useMultiplayerGame(roomCode: string) {
  const { playerId, isHost: storeIsHost, setRoom: setStoreRoom, isInitialized } = useGameStore();
  const { getPlaylistTracks } = useAppleMusic();

  // Room state
  const [room, setRoom] = useState<RoomData | null>(null);
  const [players, setPlayers] = useState<MultiplayerPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute ROUND_TIME from room settings (time_per_round is in seconds)
  const ROUND_TIME = room ? room.time_per_round * 1000 : DEFAULT_ROUND_TIME;
  const isHost = room && playerId ? room.host_id === playerId : storeIsHost;

  // Game state
  const [gameStatus, setGameStatus] = useState<MultiplayerGameStatus>("waiting");
  const [preGameCountdown, setPreGameCountdown] = useState(0);
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_ROUND_TIME);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [betweenRoundsCountdown, setBetweenRoundsCountdown] = useState(0);
  const [isFinalizingResults, setIsFinalizingResults] = useState(false);
  const [nextQuestionType, setNextQuestionType] = useState<QuestionType>("Guess the Artist");
  const [currentQuestionType, setCurrentQuestionType] = useState<QuestionType>("Guess the Artist");

  // The round the ticker derives all timing from (ref so the 100ms tick
  // always sees the latest round without re-creating the interval)
  const roundRef = useRef<RoundData | null>(null);
  // Round id whose per-round answer state has been reset (set on the
  // transition into "playing", or pre-set by fetchRoom for mid-round joins)
  const lastResetRoundRef = useRef<string | null>(null);
  // Round id whose end-of-round side effects (empty answer) have run
  const timeUpHandledRef = useRef<string | null>(null);
  // Round id for which this client has already requested advancement
  const advanceRequestedForRef = useRef<string | null>(null);

  // Player delta state: source-of-truth map + throttled flush to React state
  const playersMapRef = useRef<Map<string, MultiplayerPlayer>>(new Map());
  const playersFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPlayers = useCallback(() => {
    playersFlushTimerRef.current = null;
    const arr = Array.from(playersMapRef.current.values()).sort((a, b) => b.score - a.score);
    setPlayers((prev) => {
      const prevByIdRank = new Map(prev.map((p) => [p.player_id, p.currentRank]));
      const prevById = new Map(prev.map((p) => [p.player_id, p]));
      // Skip update if nothing meaningful changed
      const sig = (list: MultiplayerPlayer[]) =>
        list.map((p) => `${p.player_id}:${p.score}:${p.is_ready}:${p.player_name}:${p.avatar_index}`).join(",");
      const next = arr.map((p, idx) => ({
        ...p,
        previousRank: prevByIdRank.get(p.player_id) ?? idx + 1,
        currentRank: idx + 1,
        roundScore: prevById.get(p.player_id)?.roundScore ?? 0,
        hasAnswered: prevById.get(p.player_id)?.hasAnswered ?? false,
      }));
      if (sig(prev) === sig(next)) return prev;
      return next;
    });
  }, []);

  const scheduleFlushPlayers = useCallback(() => {
    if (playersFlushTimerRef.current) return;
    playersFlushTimerRef.current = setTimeout(flushPlayers, 200);
  }, [flushPlayers]);

  const seedPlayersMap = useCallback((rows: MultiplayerPlayer[]) => {
    const map = new Map<string, MultiplayerPlayer>();
    for (const row of rows) map.set(row.player_id, row);
    playersMapRef.current = map;
  }, []);

  // Normalize + store an incoming round. Merges updates (ended_at, revealed
  // track/artist names) into the current round; replaces it for newer rounds.
  const ingestRound = useCallback((raw: RoundData) => {
    const round = { ...raw } as RoundData;
    if (typeof round.options === "string") {
      try {
        round.options = JSON.parse(round.options as unknown as string);
      } catch {
        round.options = [];
      }
    }
    if (!Array.isArray(round.options)) round.options = [];

    const existing = roundRef.current;
    if (existing && existing.id === round.id) {
      // Same round: merge, never clobbering known answer fields with the
      // masked NULLs the public view returns during an active round.
      const merged: RoundData = {
        ...existing,
        ...round,
        track_name: round.track_name ?? existing.track_name,
        artist_name: round.artist_name ?? existing.artist_name,
        options: round.options.length > 0 ? round.options : existing.options,
      };
      roundRef.current = merged;
      setCurrentRound(merged);
      return;
    }
    if (existing && round.round_number < existing.round_number) return; // stale

    const qType: QuestionType = round.question_type === "song" ? "Guess the Song" : "Guess the Artist";
    roundRef.current = round;
    setCurrentRound(round);
    setRoundNumber(round.round_number);
    setNextQuestionType(qType);
    setCurrentQuestionType(qType);
  }, []);

  const fetchRoom = useCallback(async () => {
    try {
      const { data: roomData, error: roomError } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("room_code", roomCode)
        .single();

      if (roomError) throw roomError;
      setRoom(roomData);

      // Sync isHost in the game store based on actual room data
      if (playerId) {
        setStoreRoom(roomData.id, roomData.room_code, roomData.host_id === playerId);
      }

      // Fetch players
      const { data: playersData, error: playersError } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomData.id)
        .order("score", { ascending: false });

      if (playersError) throw playersError;

      const rankedPlayers = (playersData || []).map((p, idx) => ({
        ...p,
        currentRank: idx + 1,
        previousRank: idx + 1,
        roundScore: 0,
        hasAnswered: false,
      }));

      seedPlayersMap(rankedPlayers);
      setPlayers(rankedPlayers);

      if (roomData.status === "playing") {
        // Load the latest round via the safe view (masks track/artist name
        // from non-host players during active rounds). The ticker derives
        // the actual phase (pre_game/playing/between_rounds) from its timestamps.
        const { data: latestRound } = await (supabase as any)
          .from("game_rounds_public")
          .select("*")
          .eq("room_id", roomData.id)
          .order("round_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestRound) {
          const round = latestRound as RoundData;
          // Pre-mark this round as reset so the ticker doesn't wipe the
          // answer state we restore below (mid-round rejoin)
          lastResetRoundRef.current = round.id;
          ingestRound(round);

          if (playerId) {
            const { data: answerData } = await supabase
              .from("player_answers")
              .select("*")
              .eq("round_id", round.id)
              .eq("player_id", playerId)
              .maybeSingle();

            if (answerData) {
              setHasAnswered(true);
              setSelectedAnswer(answerData.answer);
              setIsCorrect(answerData.is_correct);
            }
          }
        } else {
          // Game just started; round not created yet — show the pre-game
          // screen until the round arrives via broadcast or the poll.
          setPreGameCountdown(PRE_GAME_SECONDS);
          setGameStatus((prev) => (prev === "waiting" ? "pre_game" : prev));
        }
      } else if (roomData.status === "finished") {
        setGameStatus("results");
      } else {
        setGameStatus("waiting");
      }

      setLoading(false);
    } catch (err) {
      console.error("Error fetching room:", err);
      setError("Failed to load room");
      setLoading(false);
      logError("multiplayer.fetch_room_failed", "Failed to load multiplayer room", {
        roomCode,
        error: (err as Error)?.message,
      }, (err as Error)?.stack);
    }
  }, [roomCode, playerId, setStoreRoom, seedPlayersMap, ingestRound]);

  // Handle one broadcast payload from the room channel
  const handleBroadcast = useCallback((payload: {
    table?: string;
    operation?: string;
    record?: Record<string, unknown>;
    old_record?: Record<string, unknown>;
  }) => {
    const { table, operation, record, old_record } = payload || {};

    if (table === "game_rooms") {
      if (operation === "DELETE") {
        // Room was deleted (host left) — signal termination
        setRoom(null);
        setGameStatus("terminated");
        return;
      }
      if (record) {
        const newRoom = record as unknown as RoomData;
        setRoom(newRoom);
        if (newRoom.status === "playing") {
          setPreGameCountdown((prev) => (prev > 0 ? prev : PRE_GAME_SECONDS));
          setGameStatus((prev) => (prev === "waiting" ? "pre_game" : prev));
        }
        if (newRoom.status === "finished") {
          setGameStatus("results");
        }
      }
      return;
    }

    if (table === "room_players") {
      // Apply delta directly from payload — no refetch
      if (operation === "DELETE") {
        const old = old_record as Partial<MultiplayerPlayer> | undefined;
        if (old?.player_id) playersMapRef.current.delete(old.player_id);
      } else if (record) {
        const row = record as unknown as MultiplayerPlayer;
        const existing = playersMapRef.current.get(row.player_id);
        playersMapRef.current.set(row.player_id, { ...existing, ...row });
      }
      scheduleFlushPlayers();
      return;
    }

    if (table === "game_rounds") {
      if ((operation === "INSERT" || operation === "UPDATE") && record) {
        ingestRound(record as unknown as RoundData);
      }
      return;
    }

    if (table === "player_answers") {
      if (operation === "INSERT" && record) {
        const answer = record as unknown as {
          player_id: string;
          round_id: string;
          points_earned: number;
          is_correct: boolean;
        };
        if (answer.round_id !== roundRef.current?.id) return; // stale round
        setPlayers((prev) =>
          prev.map((p) =>
            p.player_id === answer.player_id
              ? { ...p, hasAnswered: true, roundScore: answer.points_earned }
              : p
          )
        );
        // If this is our own answer, use the server-graded result as the source of truth
        if (answer.player_id === playerId) {
          setIsCorrect(answer.is_correct);
        }
      }
    }
  }, [playerId, scheduleFlushPlayers, ingestRound]);

  // Subscribe to the room's private Broadcast channel. Database triggers
  // broadcast every relevant table change to topic room:<id>. This replaces
  // postgres_changes, whose per-event-per-subscriber RLS checks scale
  // quadratically with player count and silently drop events under load.
  useEffect(() => {
    if (!room?.id) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch {
        // private channel auth will be retried by the client; poll covers gaps
      }
      if (cancelled) return;

      channel = supabase
        .channel(`room:${room.id}`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, (msg) => handleBroadcast(msg.payload))
        .on("broadcast", { event: "UPDATE" }, (msg) => handleBroadcast(msg.payload))
        .on("broadcast", { event: "DELETE" }, (msg) => handleBroadcast(msg.payload))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            logInfo("realtime.subscribed", "Room broadcast channel subscribed", { roomId: room.id, roomCode: room.room_code });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            logWarn("realtime.disconnected", `Room broadcast channel ${status}`, { roomId: room.id, roomCode: room.room_code, status });
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [room?.id, handleBroadcast]);

  // ---- Wall-clock phase ticker ----
  // Derives the game phase, round timer and countdowns from the round's
  // server timestamps every 100ms. All clients follow the same timeline, so
  // audio starts simultaneously, missed events self-heal, and background-tab
  // timer drift disappears (each tick recomputes from Date.now()).
  useEffect(() => {
    if (!room || room.status !== "playing") return;

    const tick = () => {
      const round = roundRef.current;
      if (!round) return; // waiting for the first round to arrive

      const now = Date.now();
      const start = new Date(round.started_at).getTime();
      const naturalEnd = start + ROUND_TIME;
      const endedAtMs = round.ended_at ? new Date(round.ended_at).getTime() : null;
      // If the round ended early (everyone answered), keep the graded reveal
      // on screen briefly before moving on.
      const effectiveEnd = endedAtMs !== null ? Math.min(naturalEnd, endedAtMs + REVEAL_MS) : naturalEnd;

      if (now < start) {
        // Counting down to this round's start
        const secs = Math.max(1, Math.ceil((start - now) / 1000));
        setTimeLeft(ROUND_TIME);
        if (round.round_number === 1) {
          setPreGameCountdown(secs);
          setGameStatus("pre_game");
        } else {
          setBetweenRoundsCountdown(secs);
          setGameStatus("between_rounds");
        }
      } else if (now < effectiveEnd) {
        // Round is live
        if (lastResetRoundRef.current !== round.id) {
          lastResetRoundRef.current = round.id;
          setHasAnswered(false);
          setSelectedAnswer(null);
          setIsCorrect(null);
          setPlayers((prev) => prev.map((p) => ({ ...p, roundScore: 0, hasAnswered: false })));
        }
        setTimeLeft(Math.max(0, naturalEnd - now));
        setPreGameCountdown(0);
        setBetweenRoundsCountdown(0);
        setGameStatus("playing");
      } else {
        // Round over; waiting for the next round (or the finish)
        setTimeLeft(0);
        const overMs = now - effectiveEnd;
        setBetweenRoundsCountdown(Math.max(0, Math.ceil((BETWEEN_ROUNDS_TIME - overMs) / 1000)));
        setGameStatus((prev) => (prev === "results" || prev === "terminated" ? prev : "between_rounds"));
      }
    };

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [room?.status, room?.id, ROUND_TIME]);

  // When a round ends without this player answering, record an empty answer
  // (kept for stats/history; round advancement no longer depends on it)
  useEffect(() => {
    if (gameStatus !== "between_rounds" || !currentRound || !room || !playerId) return;
    const start = new Date(currentRound.started_at).getTime();
    if (Date.now() < start) return; // counting down to a round that hasn't started
    if (timeUpHandledRef.current === currentRound.id) return;
    timeUpHandledRef.current = currentRound.id;
    if (hasAnswered) return;

    (async () => {
      try {
        const { data: existing } = await supabase
          .from("player_answers")
          .select("id")
          .eq("round_id", currentRound.id)
          .eq("player_id", playerId)
          .maybeSingle();

        if (existing) {
          setHasAnswered(true);
          return;
        }

        await supabase.from("player_answers").insert({
          room_id: room.id,
          round_id: currentRound.id,
          player_id: playerId,
          answer: "",
          is_correct: false,
          points_earned: 0,
        });
        setHasAnswered(true);
        logWarn("multiplayer.answer_timeout", "Multiplayer round timed out before player answered", {
          roomId: room.id,
          roomCode: room.room_code,
          roundId: currentRound.id,
          roundNumber,
        });
      } catch (err) {
        console.error("Error submitting empty answer:", err);
        logError("multiplayer.empty_answer_failed", "Failed to submit empty answer on timeout", {
          roomId: room.id,
          roomCode: room.room_code,
          roundId: currentRound.id,
          error: (err as Error)?.message,
        }, (err as Error)?.stack);
      }
    })();
  }, [gameStatus, currentRound?.id, room?.id, hasAnswered, playerId, roundNumber]);

  // ---- Server-side round advancement ----
  // When the current round is over, ask the server for the next round (or the
  // finish). advance_game_round() is idempotent and any room member may call
  // it: the host asks immediately, everyone else is a delayed fallback — so
  // the game keeps moving even if the host's tab is throttled or gone.
  useEffect(() => {
    if (gameStatus !== "between_rounds" || !room || !currentRound || !playerId) return;
    const start = new Date(currentRound.started_at).getTime();
    if (Date.now() < start) return; // already counting down to the next round
    if (advanceRequestedForRef.current === currentRound.id) return;

    const isFinal = currentRound.round_number >= (room.total_rounds || 10);
    // Final round: let the 5s "Loading Results" countdown play out first.
    const delay = isFinal
      ? (isHost ? BETWEEN_ROUNDS_TIME : BETWEEN_ROUNDS_TIME + 3000)
      : (isHost ? 0 : 2500);

    const t = setTimeout(async () => {
      advanceRequestedForRef.current = currentRound.id;
      if (isFinal) setIsFinalizingResults(true);
      try {
        const { error: rpcError } = await (supabase as any).rpc("advance_game_round", {
          _room_id: room.id,
        });
        if (rpcError) throw rpcError;
      } catch (err) {
        console.error("Error advancing round:", err);
        logError("multiplayer.advance_failed", "advance_game_round RPC failed", {
          roomId: room.id,
          roomCode: room.room_code,
          roundNumber: currentRound.round_number,
          error: (err as Error)?.message,
        }, (err as Error)?.stack);
      }
    }, delay);

    return () => clearTimeout(t);
  }, [gameStatus, currentRound?.id, currentRound?.started_at, room?.id, room?.total_rounds, isHost, playerId]);

  // Polling fallback — reconciles room, latest round and players every 3s in
  // case broadcast events were missed. This is the safety net; broadcast is
  // the fast path.
  useEffect(() => {
    if (!room?.id) return;

    const pollInterval = setInterval(async () => {
      try {
        const { data: roomData, error: roomErr } = await supabase
          .from("game_rooms")
          .select("*")
          .eq("id", room.id)
          .maybeSingle();

        if (roomErr) return; // transient error — don't treat as room-deleted
        if (!roomData) {
          // Room was deleted (host left)
          setRoom(null);
          setGameStatus("terminated");
          return;
        }

        if (roomData.status === "finished") {
          setGameStatus("results");
        }
        if (
          roomData.status !== room.status ||
          roomData.current_round !== room.current_round
        ) {
          setRoom(roomData as RoomData);
        }

        if (roomData.status === "playing") {
          const { data: latestRound } = await (supabase as any)
            .from("game_rounds_public")
            .select("*")
            .eq("room_id", room.id)
            .order("round_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestRound) {
            const lr = latestRound as RoundData;
            const cur = roundRef.current;
            if (!cur || lr.round_number > cur.round_number) {
              if (cur) {
                logWarn("realtime.missed_round_insert", "Polling fallback caught a missed round", {
                  roomId: room.id,
                  roomCode: room.room_code,
                  previousRound: cur.round_number,
                  caughtUpTo: lr.round_number,
                });
              }
              ingestRound(lr);
            } else if (
              lr.id === cur.id &&
              (lr.ended_at !== cur.ended_at ||
                lr.started_at !== cur.started_at ||
                (!cur.track_name && !!lr.track_name))
            ) {
              // Same round: sync ended_at / revealed answer fields
              ingestRound(lr);
            }
          }
        }

        // Players reconciliation — rebuilds the map then schedules a flush
        const { data: playersData } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", room.id)
          .order("score", { ascending: false });

        if (playersData) {
          const next = new Map<string, MultiplayerPlayer>();
          for (const p of playersData as MultiplayerPlayer[]) {
            const existing = playersMapRef.current.get(p.player_id);
            next.set(p.player_id, { ...existing, ...p });
          }
          const prevMap = playersMapRef.current;
          let changed = prevMap.size !== next.size;
          if (!changed) {
            for (const [id, p] of next) {
              const prev = prevMap.get(id);
              if (!prev || prev.score !== p.score || prev.is_ready !== p.is_ready || prev.player_name !== p.player_name) {
                changed = true;
                break;
              }
            }
          }
          if (changed) {
            playersMapRef.current = next;
            scheduleFlushPlayers();
          }
        }
      } catch (err) {
        console.error("[Poll] Error:", err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [room?.id, room?.status, room?.current_round, ingestRound, scheduleFlushPlayers]);

  // Submit answer
  const submitAnswer = useCallback(async (answer: string) => {
    if (hasAnswered || !currentRound || !room || !playerId) return;

    setSelectedAnswer(answer);
    setHasAnswered(true);

    try {
      // Insert answer — server-side triggers grade it, update the player's
      // score atomically, and end the round early when everyone has answered.
      const { data: inserted, error: insertErr } = await supabase
        .from("player_answers")
        .insert({
          room_id: room.id,
          round_id: currentRound.id,
          player_id: playerId,
          answer,
        })
        .select("is_correct, points_earned")
        .single();

      if (insertErr) throw insertErr;

      if (typeof inserted?.is_correct === "boolean") setIsCorrect(inserted.is_correct);
    } catch (err) {
      console.error("Error submitting answer:", err);
      logError("multiplayer.submit_answer_failed", "Failed to submit multiplayer answer", {
        roomId: room.id,
        roomCode: room.room_code,
        roundId: currentRound.id,
        roundNumber,
        answer,
        error: (err as Error)?.message,
      }, (err as Error)?.stack);
    }
  }, [hasAnswered, currentRound, room, playerId, roundNumber]);

  // Shuffle array helper
  const shuffleArray = <T,>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Load tracks for the game
  const loadTracks = useCallback(async (category: string) => {
    const playlist = getPlaylistById(category) || PLAYLISTS[0];
    const result = await getPlaylistTracks(playlist.searchTerms, playlist.name, 50);
    if (result?.tracks) {
      // Shuffle tracks to ensure unique, non-repeating order each game
      return shuffleArray(result.tracks);
    }
    return [];
  }, [getPlaylistTracks]);

  // Build the full round plan (track + question type + options per round).
  // Stored server-side so advance_game_round() can create rounds without
  // depending on the host's browser being awake.
  const buildRoundPlan = useCallback((tracks: AppleMusicTrack[]) => {
    const maxRounds = Math.min(tracks.length, 20); // 20 = largest rounds setting
    return tracks.slice(0, maxRounds).map((track) => {
      const questionType = QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
      const isGuessSong = questionType === "Guess the Song";

      let options: string[];
      if (isGuessSong) {
        const otherSongs = tracks
          .filter((t) => t.trackId !== track.trackId && t.trackName !== track.trackName)
          .map((t) => t.trackName)
          .filter((s, i, arr) => arr.indexOf(s) === i)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        options = [track.trackName, ...otherSongs].sort(() => Math.random() - 0.5);
      } else {
        const otherArtists = tracks
          .filter((t) => t.trackId !== track.trackId && t.artistName !== track.artistName)
          .map((t) => t.artistName)
          .filter((a, i, arr) => arr.indexOf(a) === i)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        options = [track.artistName, ...otherArtists].sort(() => Math.random() - 0.5);
      }

      return {
        track_id: track.trackId.toString(),
        track_name: track.trackName,
        artist_name: track.artistName,
        preview_url: track.previewUrl,
        artwork_url: track.artworkUrl100?.replace("100x100", "600x600") || "",
        question_type: isGuessSong ? "song" : "artist",
        options,
      };
    });
  }, []);

  // Start the game (host only): store the round plan server-side, flip the
  // room to playing, then let the server create round 1 (with a 5s pre-game
  // gap on the database clock).
  const startGame = useCallback(async (category: string) => {
    if (!isHost || !room) return;

    try {
      const loadedTracks = await loadTracks(category);
      if (loadedTracks.length < 10) {
        toast.error("Not enough tracks loaded");
        return;
      }

      const plan = buildRoundPlan(loadedTracks);
      const { error: planErr } = await (supabase as any)
        .from("room_tracks")
        .upsert({ room_id: room.id, plan }, { onConflict: "room_id" });
      if (planErr) throw planErr;

      const { error: roomErr } = await supabase
        .from("game_rooms")
        .update({ status: "playing", category, started_at: new Date().toISOString() })
        .eq("id", room.id);
      if (roomErr) throw roomErr;

      const { error: advErr } = await (supabase as any).rpc("advance_game_round", {
        _room_id: room.id,
      });
      if (advErr) throw advErr;
    } catch (err) {
      console.error("Error starting game:", err);
      toast.error("Failed to start game");
      logError("multiplayer.start_game_failed", "Failed to start multiplayer game", {
        roomId: room.id,
        roomCode: room.room_code,
        category,
        error: (err as Error)?.message,
      }, (err as Error)?.stack);
    }
  }, [isHost, room, loadTracks, buildRoundPlan]);

  // End game (host ends early via endGameNow, or fallback)
  const endGame = useCallback(async () => {
    if (!room) return;
    await supabase
      .from("game_rooms")
      .update({ status: "finished", finished_at: new Date().toISOString() })
      .eq("id", room.id);
    setGameStatus("results");
  }, [room]);

  useEffect(() => {
    if (gameStatus === "playing" || gameStatus === "results" || gameStatus === "waiting") {
      setIsFinalizingResults(false);
    }
  }, [gameStatus]);

  const toggleReady = useCallback(async () => {
    if (!room || !playerId) return;

    const currentPlayer = players.find((p) => p.player_id === playerId);
    await supabase
      .from("room_players")
      .update({ is_ready: !currentPlayer?.is_ready })
      .eq("room_id", room.id)
      .eq("player_id", playerId);
  }, [room, playerId, players]);

  // Play again - reset room to lobby state
  const playAgain = useCallback(async () => {
    if (!room || !playerId) return;

    if (isHost) {
      // Delete old answers first (references rounds)
      await supabase
        .from("player_answers")
        .delete()
        .eq("room_id", room.id);

      // Delete old rounds and the stored round plan
      await supabase
        .from("game_rounds")
        .delete()
        .eq("room_id", room.id);

      await (supabase as any)
        .from("room_tracks")
        .delete()
        .eq("room_id", room.id);

      // Reset all player scores and ready status
      await supabase
        .from("room_players")
        .update({ score: 0, is_ready: false })
        .eq("room_id", room.id);

      // Reset room status last (broadcasts to other players)
      await supabase
        .from("game_rooms")
        .update({ status: "waiting", current_round: 0, started_at: null, finished_at: null })
        .eq("id", room.id);
    }

    // Reset local game state
    setGameStatus("waiting");
    setCurrentRound(null);
    roundRef.current = null;
    setRoundNumber(0);
    setTimeLeft(DEFAULT_ROUND_TIME);
    setHasAnswered(false);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setBetweenRoundsCountdown(0);
    setPreGameCountdown(0);
    setIsFinalizingResults(false);
    lastResetRoundRef.current = null;
    timeUpHandledRef.current = null;
    advanceRequestedForRef.current = null;
  }, [room, playerId, isHost]);

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (!room || !playerId) return;

    await supabase
      .from("room_players")
      .delete()
      .eq("room_id", room.id)
      .eq("player_id", playerId);

    // If host leaves, delete the room
    if (isHost) {
      await supabase.from("game_rooms").delete().eq("id", room.id);
    }
  }, [room, playerId, isHost]);

  // Host: kick a player from the room
  const kickPlayer = useCallback(async (targetPlayerId: string) => {
    if (!room || !isHost) return;
    if (targetPlayerId === playerId) return;
    const { error: kickErr } = await supabase
      .from("room_players")
      .delete()
      .eq("room_id", room.id)
      .eq("player_id", targetPlayerId);
    if (kickErr) throw kickErr;
  }, [room, playerId, isHost]);

  // Host: end the game immediately
  const endGameNow = useCallback(async () => {
    if (!room || !isHost) return;
    await endGame();
  }, [room, isHost, endGame]);

  // Initialize - wait for auth before fetching
  useEffect(() => {
    if (isInitialized && playerId) {
      fetchRoom();
    }
  }, [fetchRoom, isInitialized, playerId]);

  // Re-sync when the tab becomes visible again (background tabs throttle
  // timers and can miss broadcasts; the ticker self-corrects timing, this
  // refreshes the data)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (isInitialized && playerId) {
        fetchRoom();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchRoom, isInitialized, playerId]);

  const isTerminated = gameStatus === "terminated";

  return {
    room,
    players,
    loading,
    error,
    gameStatus,
    isTerminated,
    currentRound,
    roundNumber,
    timeLeft,
    hasAnswered,
    selectedAnswer,
    isCorrect,
    betweenRoundsCountdown,
    preGameCountdown,
    isFinalizingResults,
    nextQuestionType,
    currentQuestionType,
    startGame,
    submitAnswer,
    toggleReady,
    leaveRoom,
    playAgain,
    kickPlayer,
    endGameNow,
    isHost,
    playerId,
    ROUND_TIME,
  };
}
