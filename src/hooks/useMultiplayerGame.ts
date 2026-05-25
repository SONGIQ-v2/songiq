import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic, type AppleMusicTrack } from "@/hooks/useAppleMusic";
import { getPlaylistById, PLAYLISTS } from "@/lib/playlists";
import { calculatePoints } from "@/lib/spotify";
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
const BETWEEN_ROUNDS_TIME = 5000; // 5 seconds between rounds
const QUESTION_TYPES = ["Guess the Artist", "Guess the Song"] as const;
type QuestionType = typeof QUESTION_TYPES[number];

export function useMultiplayerGame(roomCode: string) {
  const { playerId, isHost, setRoom: setStoreRoom, initializeAuth, isInitialized } = useGameStore();
  const { getPlaylistTracks } = useAppleMusic();

  // Room state
  const [room, setRoom] = useState<RoomData | null>(null);
  const [players, setPlayers] = useState<MultiplayerPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute ROUND_TIME from room settings (time_per_round is in seconds)
  const ROUND_TIME = room ? room.time_per_round * 1000 : DEFAULT_ROUND_TIME;

  // Game state
  const [gameStatus, setGameStatus] = useState<"waiting" | "playing" | "between_rounds" | "results">("waiting");
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_ROUND_TIME);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [roundStartTime, setRoundStartTime] = useState<number>(0);
  const [tracks, setTracks] = useState<AppleMusicTrack[]>([]);
  const [betweenRoundsCountdown, setBetweenRoundsCountdown] = useState(0);
  const [isFinalizingResults, setIsFinalizingResults] = useState(false);
  const [nextQuestionType, setNextQuestionType] = useState<QuestionType>("Guess the Artist");
  const [currentQuestionType, setCurrentQuestionType] = useState<QuestionType>("Guess the Artist");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const betweenRoundsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tracksRef = useRef<AppleMusicTrack[]>([]);
  const currentRoundRef = useRef<RoundData | null>(null);
  const queuedRoundRef = useRef<RoundData | null>(null);
  const createRoundRef = useRef<(tracks: AppleMusicTrack[], roundNum: number, startsAtMs?: number) => Promise<void>>();
  const endGameRef = useRef<() => Promise<void>>();
  const countdownActiveRef = useRef(false);
  const betweenRoundsEndsAtRef = useRef<number | null>(null);
  const serverTimeOffsetRef = useRef(0);

  const serverNow = useCallback(() => Date.now() + serverTimeOffsetRef.current, []);

  const syncServerClock = useCallback(async () => {
    const requestStartedAt = Date.now();
    const { data, error } = await (supabase as any).rpc("server_time_ms");
    if (error || data == null) return;

    const requestEndedAt = Date.now();
    const clientMidpoint = requestStartedAt + (requestEndedAt - requestStartedAt) / 2;
    serverTimeOffsetRef.current = Number(data) - clientMidpoint;
  }, []);
  
  // Initialize auth on mount
  useEffect(() => {
    if (!isInitialized) {
      initializeAuth();
    }
  }, [isInitialized, initializeAuth]);

  useEffect(() => {
    if (!isInitialized || !playerId) return;

    syncServerClock();
    const clockSyncInterval = setInterval(syncServerClock, 30000);
    return () => clearInterval(clockSyncInterval);
  }, [isInitialized, playerId, syncServerClock]);

  // Fetch initial room data
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
      if (playerId && roomData.host_id === playerId) {
        setStoreRoom(roomData.id, roomData.room_code, true);
      } else if (playerId) {
        setStoreRoom(roomData.id, roomData.room_code, false);
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
      
      setPlayers(rankedPlayers);
      
      // Set game status based on room status
      if (roomData.status === "playing") {
        // Fetch current round if game is in progress.
        // Use the safe view: hides track_name/artist_name from non-host players during active rounds.
        const { data: roundData } = await (supabase as any)
          .from("game_rounds_public")
          .select("*")
          .eq("room_id", roomData.id)
          .eq("round_number", roomData.current_round)
          .maybeSingle();
          
        if (roundData) {
          const round = roundData as RoundData;
          // Parse options if it's a string
          if (typeof round.options === 'string') {
            round.options = JSON.parse(round.options);
          }

          // Sync question type from the loaded round (critical for guests on first round)
          const qType: QuestionType = round.question_type === 'song' ? "Guess the Song" : "Guess the Artist";
          setCurrentQuestionType(qType);
          setNextQuestionType(qType);
          
          // Calculate remaining time based on when round started
          const elapsed = serverNow() - new Date(round.started_at).getTime();
          const remaining = Math.max(0, ROUND_TIME - elapsed);
          
          // Check if this player has already answered this round
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
          
          // If round time has expired (more than ROUND_TIME + buffer passed)
          if (remaining <= 0) {
            console.log("Round already expired on load, checking for next round...");
            // Check if there's a newer round (via safe view)
            const { data: latestRound } = await (supabase as any)
              .from("game_rounds_public")
              .select("*")
              .eq("room_id", roomData.id)
              .order("round_number", { ascending: false })
              .limit(1)
              .maybeSingle();
              
            if (latestRound && latestRound.round_number > round.round_number) {
              // There's a newer round, use that
              const newRound = latestRound as RoundData;
              if (typeof newRound.options === 'string') {
                newRound.options = JSON.parse(newRound.options);
              }
              const newElapsed = serverNow() - new Date(newRound.started_at).getTime();
              const newRemaining = Math.max(0, ROUND_TIME - newElapsed);
              
              setCurrentRound(newRound);
              setRoundNumber(newRound.round_number);
              setRoundStartTime(new Date(newRound.started_at).getTime());
              setTimeLeft(newRemaining);
              const newQType: QuestionType = newRound.question_type === 'song' ? "Guess the Song" : "Guess the Artist";
              setCurrentQuestionType(newQType);
              setNextQuestionType(newQType);
              setGameStatus("playing");
            } else {
              // No newer round - host needs to create next round
              // Set to between_rounds to show waiting state
              setCurrentRound(round);
              setRoundNumber(round.round_number);
              setRoundStartTime(new Date(round.started_at).getTime());
              setTimeLeft(0);
              setGameStatus("between_rounds");
              setBetweenRoundsCountdown(5);
            }
          } else {
            // Round still active
            setCurrentRound(round);
            setRoundNumber(round.round_number);
            setRoundStartTime(new Date(round.started_at).getTime());
            setTimeLeft(remaining);
            setGameStatus("playing");
          }
        } else {
          // No round found but room is playing - wait for round
          setGameStatus("playing");
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
    }, [roomCode, playerId, serverNow]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!room?.id) return;

    console.log("[Realtime] Setting up subscriptions for room:", room.id);

    // Subscribe to room changes
    const roomChannel = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          console.log("[Realtime] Room update received:", payload.new);
        if (payload.eventType === "DELETE") {
            // Room was deleted (host left) — signal termination
            setRoom(null);
            setGameStatus("terminated" as any);
            return;
          }
          if (payload.new) {
            const newRoom = payload.new as RoomData;
            setRoom(newRoom);
            if (newRoom.status === "playing") {
              setGameStatus((prev) => prev === "waiting" ? "playing" : prev);
            }
            if (newRoom.status === "finished") {
              setGameStatus("results");
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${room.id}` },
        async () => {
          console.log("[Realtime] Players update received");
          // Refetch all players to get correct ordering
          const { data } = await supabase
            .from("room_players")
            .select("*")
            .eq("room_id", room.id)
            .order("score", { ascending: false });

          if (data) {
            setPlayers((prev) => {
              const prevRanks = new Map(prev.map((p) => [p.player_id, p.currentRank]));
              return data.map((p, idx) => ({
                ...p,
                previousRank: prevRanks.get(p.player_id) || idx + 1,
                currentRank: idx + 1,
                roundScore: prev.find((pp) => pp.player_id === p.player_id)?.roundScore || 0,
                hasAnswered: prev.find((pp) => pp.player_id === p.player_id)?.hasAnswered || false,
              }));
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_rounds", filter: `room_id=eq.${room.id}` },
        (payload) => {
          console.log("[Realtime] New round received:", payload.new);
          const round = payload.new as RoundData;
          if (typeof round.options === 'string') {
            round.options = JSON.parse(round.options);
          }
          
          const qType: QuestionType = round.question_type === 'song' ? "Guess the Song" : "Guess the Artist";
          
          // Always update the hint for the overlay
          setNextQuestionType(qType);
          const roundStartsAt = new Date(round.started_at).getTime();
          setRoundStartTime(roundStartsAt);
          
          // Only transition to playing if we're NOT in the between-rounds countdown
          setGameStatus((prev) => {
            if (prev === "between_rounds") {
              console.log("[Realtime] Round pre-loaded during countdown, staying in between_rounds");
              queuedRoundRef.current = round;
              return prev; // Stay in between_rounds, countdown will handle transition
            }

            setCurrentRound(round);
            setRoundNumber(round.round_number);
            setCurrentQuestionType(qType);
            
            // Reset state for new round
            timeUpHandledRef.current = null;
            setHasAnswered(false);
            setSelectedAnswer(null);
            setIsCorrect(null);
            setPlayers((prevPlayers) => prevPlayers.map((p) => ({ ...p, roundScore: 0, hasAnswered: false })));
            setTimeLeft(Math.max(0, ROUND_TIME - (serverNow() - roundStartsAt)));
            
            return "playing";
          });
          
          console.log("[Realtime] Round state updated, question_type:", round.question_type, "preview_url:", round.preview_url);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "player_answers", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const answer = payload.new as { player_id: string; points_earned: number; is_correct: boolean };
          setPlayers((prev) =>
            prev.map((p) =>
              p.player_id === answer.player_id
                ? { ...p, hasAnswered: true, roundScore: answer.points_earned }
                : p
            )
          );
          // If this is our own answer, use the realtime-graded result as the source of truth
          if (answer.player_id === playerId) {
            setIsCorrect(answer.is_correct);
          }
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] Channel status:", status);
        if (status === "SUBSCRIBED") {
          logInfo("realtime.subscribed", "Realtime channel subscribed", { roomId: room.id, roomCode: room.room_code });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          logWarn("realtime.disconnected", `Realtime channel ${status}`, { roomId: room.id, roomCode: room.room_code, status });
        }
      });

    return () => {
      supabase.removeChannel(roomChannel);
    };
  }, [room?.id, playerId, ROUND_TIME, serverNow]); // Don't re-subscribe on gameStatus change

  // Polling fallback - ensures state syncs even if realtime fails
  useEffect(() => {
    if (!room?.id) return;

    const pollInterval = setInterval(async () => {
      try {
        // Poll room status
        const { data: roomData } = await supabase
          .from("game_rooms")
          .select("*")
          .eq("id", room.id)
          .single();

        if (!roomData) {
          // Room was deleted (host left)
          setRoom(null);
          setGameStatus("terminated" as any);
          return;
        }

        // Check for status changes
        if (roomData.status === "playing" && gameStatus === "waiting") {
          console.log("[Poll] Room status changed to playing");
          setGameStatus("playing");
        }
        if (roomData.status === "finished" && gameStatus !== "results") {
          console.log("[Poll] Room status changed to finished");
          setGameStatus("results");
        }
        // Always keep local room object fresh
        if (
          roomData.status !== room.status ||
          roomData.current_round !== room.current_round
        ) {
          setRoom(roomData as RoomData);
        }

        // ---- Unified round-sync rescue ----
        // Whenever the room is actively playing, make sure our local round matches
        // the server's authoritative `current_round`. This is the catch-all that
        // rescues clients which missed the realtime INSERT for a new round.
        const serverRoundNum = roomData.current_round || 0;
        const isBehind =
          roomData.status === "playing" &&
          serverRoundNum > 0 &&
          serverRoundNum > roundNumber;

        if (isBehind || gameStatus === "between_rounds") {
          const { data: latestRound } = await (supabase as any)
            .from("game_rounds_public")
            .select("*")
            .eq("room_id", room.id)
            .order("round_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestRound && latestRound.round_number > roundNumber) {
            console.log(
              "[Poll] Catching up to round",
              latestRound.round_number,
              "(was on",
              roundNumber,
              ")"
            );
            logWarn("realtime.missed_round_insert", "Polling fallback caught a missed round", {
              roomId: room.id,
              roomCode: room.room_code,
              previousRound: roundNumber,
              caughtUpTo: latestRound.round_number,
            });
            const round = latestRound as RoundData;
            if (typeof round.options === "string") {
              round.options = JSON.parse(round.options);
            }

            const elapsed =
              serverNow() - new Date(round.started_at).getTime();
            const remaining = Math.max(0, ROUND_TIME - elapsed);
            setNextQuestionType(
              round.question_type === "song"
                ? "Guess the Song"
                : "Guess the Artist"
            );

            if (gameStatus === "between_rounds") {
              console.log("[Poll] Pre-loaded next round during countdown");
              queuedRoundRef.current = round;
              return;
            }

            setRoundNumber(round.round_number);
            setTimeLeft(remaining);
            setRoundStartTime(new Date(round.started_at).getTime());
            setCurrentRound(round);
            setCurrentQuestionType(
              round.question_type === "song"
                ? "Guess the Song"
                : "Guess the Artist"
            );
            timeUpHandledRef.current = null;
            setHasAnswered(false);
            setSelectedAnswer(null);
            setIsCorrect(null);
            setPlayers((prev) =>
              prev.map((p) => ({ ...p, roundScore: 0, hasAnswered: false }))
            );
            setGameStatus("playing");
          }
        }

        // Poll players
        const { data: playersData } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", room.id)
          .order("score", { ascending: false });

        if (playersData) {
          setPlayers((prev) => {
            // Only update if something changed
            const prevScores = prev.map(p => `${p.player_id}:${p.score}:${p.is_ready}`).join(',');
            const newScores = playersData.map(p => `${p.player_id}:${p.score}:${p.is_ready}`).join(',');
            if (prevScores === newScores) return prev;

            const prevRanks = new Map(prev.map((p) => [p.player_id, p.currentRank]));
            return playersData.map((p, idx) => ({
              ...p,
              previousRank: prevRanks.get(p.player_id) || idx + 1,
              currentRank: idx + 1,
              roundScore: prev.find((pp) => pp.player_id === p.player_id)?.roundScore || 0,
              hasAnswered: prev.find((pp) => pp.player_id === p.player_id)?.hasAnswered || false,
            }));
          });
        }
      } catch (err) {
        console.error("[Poll] Error:", err);
      }
    }, 1500); // Poll every 1.5s

    return () => clearInterval(pollInterval);
  }, [room?.id, gameStatus, roundNumber, room?.current_round, room?.status, serverNow]);

  // Track if time up has been handled for current round
  const timeUpHandledRef = useRef<string | null>(null);
  
  // Timer effect
  useEffect(() => {
    if (gameStatus !== "playing" || !currentRound) return;
    
    // Reset time up handled when round changes
    if (timeUpHandledRef.current !== currentRound.id) {
      timeUpHandledRef.current = null;
    }

    const updateTimerFromServerClock = () => {
      const elapsed = serverNow() - new Date(currentRound.started_at).getTime();
      const remaining = Math.max(0, ROUND_TIME - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
      }
    };

    updateTimerFromServerClock();
    timerRef.current = setInterval(() => {
      updateTimerFromServerClock();
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameStatus, currentRound?.id, currentRound?.started_at, ROUND_TIME, serverNow]);

  // Handle time up as separate effect
  useEffect(() => {
    if (timeLeft > 0 || !currentRound || !room || gameStatus !== "playing") return;
    if (timeUpHandledRef.current === currentRound.id) return; // Already handled
    
    timeUpHandledRef.current = currentRound.id;
    console.log("Time up! Round:", roundNumber, "isHost:", isHost);
    
    // Submit empty answer if not answered (check DB first to avoid duplicates)
    const submitEmptyAnswer = async () => {
      if (!hasAnswered && playerId) {
        try {
          // Check if answer already exists
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
      }
    };
    
    submitEmptyAnswer();
    
    // All players go to between_rounds
      setGameStatus("between_rounds");
      setBetweenRoundsCountdown(5);
  }, [timeLeft, currentRound?.id, room?.id, hasAnswered, playerId, isHost, roundNumber, gameStatus]);

  // Shared delay timer ref so player updates during the 2s window don't cancel the transition
  const allAnsweredDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel pending delay when round changes
  useEffect(() => {
    return () => {
      if (allAnsweredDelayRef.current) {
        clearTimeout(allAnsweredDelayRef.current);
        allAnsweredDelayRef.current = null;
      }
    };
  }, [currentRound?.id]);

  // Check if all players have answered → skip to next round early (with 2s delay)
  useEffect(() => {
    if (gameStatus !== "playing" || !currentRound || !room || players.length < 2) return;
    if (timeUpHandledRef.current === currentRound.id) return; // Already transitioning

    const allAnswered = players.every((p) => p.hasAnswered);
    if (!allAnswered) return;

    console.log("All players answered! Waiting 2s before next round...");
    timeUpHandledRef.current = currentRound.id;

    if (allAnsweredDelayRef.current) clearTimeout(allAnsweredDelayRef.current);
    allAnsweredDelayRef.current = setTimeout(() => {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(1);
      setGameStatus("between_rounds");
      setBetweenRoundsCountdown(5);
      allAnsweredDelayRef.current = null;
    }, 2000);
  }, [players, gameStatus, currentRound?.id, room?.id]);

  // Poll for all-answered as fallback (in case realtime misses an event)
  useEffect(() => {
    if (gameStatus !== "playing" || !currentRound || !room || players.length < 2) return;
    if (timeUpHandledRef.current === currentRound.id) return;

    const pollAnswers = setInterval(async () => {
      if (timeUpHandledRef.current === currentRound.id) {
        clearInterval(pollAnswers);
        return;
      }

      const { data: answers } = await supabase
        .from("player_answers")
        .select("player_id")
        .eq("round_id", currentRound.id);

      if (answers && answers.length >= players.length) {
        console.log("[Poll] All players answered! Waiting 2s before next round...");
        timeUpHandledRef.current = currentRound.id;
        clearInterval(pollAnswers);

        setPlayers((prev) =>
          prev.map((p) => ({
            ...p,
            hasAnswered: answers.some((a) => a.player_id === p.player_id) || p.hasAnswered,
          }))
        );

        if (allAnsweredDelayRef.current) clearTimeout(allAnsweredDelayRef.current);
        allAnsweredDelayRef.current = setTimeout(() => {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeLeft(1);
          setGameStatus("between_rounds");
          setBetweenRoundsCountdown(5);
          allAnsweredDelayRef.current = null;
        }, 2000);
      }
    }, 1500);

    return () => {
      clearInterval(pollAnswers);
    };
  }, [gameStatus, currentRound?.id, room?.id, players.length]);

  // All players: countdown is derived from the next round's server timestamp when available
  useEffect(() => {
    if (gameStatus !== "between_rounds") {
      countdownActiveRef.current = false;
      return;
    }
    if (countdownActiveRef.current) return;
    countdownActiveRef.current = true;

    console.log("Starting 5s between-rounds countdown for all players, isHost:", isHost);

    // Host pre-creates the next round immediately so question type is known for overlay
    if (isHost && room) {
      const currentTracks = tracksRef.current;
      const totalRounds = room.total_rounds || 10;

      if (roundNumber >= totalRounds) {
        console.log("Last round complete, game will end after countdown");
      } else if (currentTracks.length > 0) {
        console.log("Pre-creating next round:", roundNumber + 1);
        createRoundRef.current?.(currentTracks, roundNumber + 1, serverNow() + BETWEEN_ROUNDS_TIME);
      } else {
        console.error("No tracks available for next round!");
        toast.error("Failed to load next round - no tracks");
      }
    }

    if (betweenRoundsRef.current) clearInterval(betweenRoundsRef.current);

    const totalRounds = room?.total_rounds || 10;
    const isFinalRound = !!room && roundNumber >= totalRounds;

    setIsFinalizingResults(false);
    betweenRoundsEndsAtRef.current = serverNow() + BETWEEN_ROUNDS_TIME;
    const getCountdown = () => {
      const queuedRound = currentRoundRef.current;
      if (isFinalRound || !queuedRound || queuedRound.round_number <= roundNumber) {
        return Math.max(0, Math.ceil(((betweenRoundsEndsAtRef.current ?? serverNow()) - serverNow()) / 1000));
      }
      const elapsedToNextRound = serverNow() - new Date(queuedRound.started_at).getTime();
      return Math.max(0, Math.ceil((BETWEEN_ROUNDS_TIME - elapsedToNextRound) / 1000));
    };
    setBetweenRoundsCountdown(getCountdown());

    betweenRoundsRef.current = setInterval(async () => {
      const countdown = getCountdown();
      setBetweenRoundsCountdown(countdown);

      if (countdown <= 0) {
        if (betweenRoundsRef.current) clearInterval(betweenRoundsRef.current);
        countdownActiveRef.current = false;

        if (isFinalRound) {
          setIsFinalizingResults(true);

          if (isHost) {
            console.log("Game ending");
            endGameRef.current?.();
          }

          return;
        }

        // Transition to playing - reset round state
        timeUpHandledRef.current = null;
        setHasAnswered(false);
        setSelectedAnswer(null);
        setIsCorrect(null);
        setPlayers((prev) => prev.map((p) => ({ ...p, roundScore: 0, hasAnswered: false })));
        const queuedRound = currentRoundRef.current;
        const roundStartedAt = queuedRound ? new Date(queuedRound.started_at).getTime() : serverNow();
        setTimeLeft(Math.max(0, ROUND_TIME - (serverNow() - roundStartedAt)));
        setRoundStartTime(roundStartedAt);
        setGameStatus("playing");
        return;
      }

      setBetweenRoundsCountdown(countdown);
    }, 1000);

    return () => {
      if (betweenRoundsRef.current) clearInterval(betweenRoundsRef.current);
      countdownActiveRef.current = false;
    };
  }, [gameStatus]);

  // Submit answer
  const submitAnswer = useCallback(async (answer: string) => {
    if (hasAnswered || !currentRound || !room || !playerId) return;

    setSelectedAnswer(answer);
    setHasAnswered(true);

    const currentPlayerScore = players.find((p) => p.player_id === playerId)?.score || 0;

    try {
      // Insert answer — server-side trigger grades it and sets is_correct + points_earned
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

      const correct = inserted?.is_correct;
      const points = inserted?.points_earned ?? 0;
      if (typeof correct === "boolean") setIsCorrect(correct);

      // Update player score with server-graded points
      await supabase
        .from("room_players")
        .update({ score: currentPlayerScore + points })
        .eq("room_id", room.id)
        .eq("player_id", playerId);
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
  }, [hasAnswered, currentRound, room, playerId, players]);

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
      const shuffled = shuffleArray(result.tracks);
      setTracks(shuffled);
      return shuffled;
    }
    return [];
  }, [getPlaylistTracks]);

  // Start the game (host only)
  const startGame = useCallback(async (category: string) => {
    if (!isHost || !room) return;

    try {
      const loadedTracks = await loadTracks(category);
      if (loadedTracks.length < 10) {
        toast.error("Not enough tracks loaded");
        return;
      }

      // Update room status
      await supabase
        .from("game_rooms")
        .update({ status: "playing", category, started_at: new Date().toISOString() })
        .eq("id", room.id);

      setTracks(loadedTracks);
      tracksRef.current = loadedTracks;

      // Start first round
      await createRound(loadedTracks, 1);
    } catch (err) {
      console.error("Error starting game:", err);
      toast.error("Failed to start game");
    }
  }, [isHost, room, loadTracks]);

  // Create a new round
  const createRound = useCallback(async (availableTracks: AppleMusicTrack[], roundNum: number, startsAtMs?: number) => {
    if (!room) return;

    const track = availableTracks[roundNum - 1];
    if (!track) {
      await endGame();
      return;
    }

    // Randomly pick question type for this round
    const questionType = QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
    const isGuessSong = questionType === "Guess the Song";

    // Generate options based on question type
    let options: string[];
    if (isGuessSong) {
      const otherSongs = availableTracks
        .filter((t) => t.trackId !== track.trackId && t.trackName !== track.trackName)
        .map((t) => t.trackName)
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      options = [track.trackName, ...otherSongs].sort(() => Math.random() - 0.5);
    } else {
      const otherArtists = availableTracks
        .filter((t) => t.trackId !== track.trackId && t.artistName !== track.artistName)
        .map((t) => t.artistName)
        .filter((a, i, arr) => arr.indexOf(a) === i)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      options = [track.artistName, ...otherArtists].sort(() => Math.random() - 0.5);
    }

    await supabase.from("game_rounds").insert({
      room_id: room.id,
      round_number: roundNum,
      track_id: track.trackId.toString(),
      track_name: track.trackName,
      artist_name: track.artistName,
      preview_url: track.previewUrl,
      options: JSON.stringify(options),
      artwork_url: track.artworkUrl100?.replace('100x100', '600x600') || '',
      question_type: isGuessSong ? 'song' : 'artist',
      started_at: new Date(startsAtMs ?? Date.now()).toISOString(),
    });

    await supabase
      .from("game_rooms")
      .update({ current_round: roundNum })
      .eq("id", room.id);
  }, [room]);

  // Start next round
  const startNextRound = useCallback(async () => {
    if (!isHost || !room || tracks.length === 0) return;
    await createRound(tracks, roundNumber + 1);
  }, [isHost, room, tracks, roundNumber, createRound]);

  // End game
  const endGame = useCallback(async () => {
    if (!room) return;
    await supabase
      .from("game_rooms")
      .update({ status: "finished", finished_at: new Date().toISOString() })
      .eq("id", room.id);
    setGameStatus("results");
  }, [room]);

  // Keep refs in sync for use in interval callbacks
  useEffect(() => {
    createRoundRef.current = createRound;
  }, [createRound]);

  useEffect(() => {
    endGameRef.current = endGame;
  }, [endGame]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    currentRoundRef.current = currentRound;
  }, [currentRound]);

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

      // Delete old rounds
      await supabase
        .from("game_rounds")
        .delete()
        .eq("room_id", room.id);

      // Reset all player scores and ready status
      await supabase
        .from("room_players")
        .update({ score: 0, is_ready: false })
        .eq("room_id", room.id);

      // Reset room status last (triggers realtime for other players)
      await supabase
        .from("game_rooms")
        .update({ status: "waiting", current_round: 0, started_at: null, finished_at: null })
        .eq("id", room.id);
    }

    // Reset local game state
    setGameStatus("waiting");
    setCurrentRound(null);
    setRoundNumber(0);
    setTimeLeft(DEFAULT_ROUND_TIME);
    setHasAnswered(false);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setTracks([]);
    tracksRef.current = [];
    timeUpHandledRef.current = null;
    countdownActiveRef.current = false;
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

  // Initialize
  // Initialize - wait for auth before fetching
  useEffect(() => {
    if (isInitialized && playerId) {
      fetchRoom();
    }
  }, [fetchRoom, isInitialized, playerId]);

  // Reload tracks if host navigated to game page without them (e.g. lobby → game page transition)
  useEffect(() => {
    if (!isHost || !room || tracks.length > 0) return;
    if (gameStatus !== "playing" && gameStatus !== "between_rounds") return;

    console.log("Host has no tracks loaded, reloading for category:", room.category);
    loadTracks(room.category).then((loaded) => {
      if (loaded.length > 0) {
        console.log("Tracks reloaded:", loaded.length);
        setTracks(loaded);
        tracksRef.current = loaded;
      } else {
        console.error("Failed to reload tracks");
        toast.error("Failed to reload tracks for next round");
      }
    });
  }, [isHost, room?.id, room?.category, gameStatus, tracks.length, loadTracks]);

  // Re-sync timer + round when tab becomes visible (handles background tab pause)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      // 1) Resync timer for the current round
      if (gameStatus === 'playing' && currentRound) {
        await syncServerClock();
        const elapsed = serverNow() - new Date(currentRound.started_at).getTime();
        const remaining = Math.max(0, ROUND_TIME - elapsed);
        console.log("Tab visible, syncing timer. Remaining:", remaining);
        setTimeLeft(remaining);
      }

      // 2) If we're behind the server's current_round, force a refetch immediately
      if (room?.id) {
        const { data: roomData } = await supabase
          .from("game_rooms")
          .select("*")
          .eq("id", room.id)
          .single();
        if (roomData && roomData.status === "playing" && (roomData.current_round || 0) > roundNumber) {
          console.log("[Visibility] Behind server round, forcing resync");
          setRoom(roomData as RoomData);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [gameStatus, currentRound, room?.id, roundNumber, ROUND_TIME, serverNow, syncServerClock]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (betweenRoundsRef.current) clearInterval(betweenRoundsRef.current);
    };
  }, []);

  // Expose terminated status
  const isTerminated = gameStatus === ("terminated" as any);

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
    isHost: room ? room.host_id === playerId : isHost,
    playerId,
    ROUND_TIME,
  };
}
