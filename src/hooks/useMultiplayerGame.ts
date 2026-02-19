import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic, type AppleMusicTrack } from "@/hooks/useAppleMusic";
import { getPlaylistById, PLAYLISTS } from "@/lib/playlists";
import { calculatePoints } from "@/lib/spotify";
import { toast } from "sonner";

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
}

const ROUND_TIME = 20000; // 20 seconds per round
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

  // Game state
  const [gameStatus, setGameStatus] = useState<"waiting" | "playing" | "between_rounds" | "results">("waiting");
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [roundStartTime, setRoundStartTime] = useState<number>(0);
  const [tracks, setTracks] = useState<AppleMusicTrack[]>([]);
  const [betweenRoundsCountdown, setBetweenRoundsCountdown] = useState(0);
  const [nextQuestionType, setNextQuestionType] = useState<QuestionType>("Guess the Artist");

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const betweenRoundsRef = useRef<NodeJS.Timeout | null>(null);
  const tracksRef = useRef<AppleMusicTrack[]>([]);
  const createRoundRef = useRef<(tracks: AppleMusicTrack[], roundNum: number) => Promise<void>>();
  const endGameRef = useRef<() => Promise<void>>();
  
  // Initialize auth on mount
  useEffect(() => {
    if (!isInitialized) {
      initializeAuth();
    }
  }, [isInitialized, initializeAuth]);

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
        // Fetch current round if game is in progress
        const { data: roundData } = await supabase
          .from("game_rounds")
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
          
          // Calculate remaining time based on when round started
          const elapsed = Date.now() - new Date(round.started_at).getTime();
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
            // Check if there's a newer round
            const { data: latestRound } = await supabase
              .from("game_rounds")
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
              const newElapsed = Date.now() - new Date(newRound.started_at).getTime();
              const newRemaining = Math.max(0, ROUND_TIME - newElapsed);
              
              setCurrentRound(newRound);
              setRoundNumber(newRound.round_number);
              setRoundStartTime(new Date(newRound.started_at).getTime());
              setTimeLeft(newRemaining);
              setGameStatus("playing");
            } else {
              // No newer round - host needs to create next round
              // Set to between_rounds to show waiting state
              setCurrentRound(round);
              setRoundNumber(round.round_number);
              setRoundStartTime(new Date(round.started_at).getTime());
              setTimeLeft(0);
              setGameStatus("between_rounds");
              setBetweenRoundsCountdown(0);
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
    }
  }, [roomCode, playerId]);

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
          
          // Reset time up handled ref for new round
          timeUpHandledRef.current = null;
          
          // Reset state for new round
          setHasAnswered(false);
          setSelectedAnswer(null);
          setIsCorrect(null);
          
          // Reset player round scores
          setPlayers((prev) => prev.map((p) => ({ ...p, roundScore: 0, hasAnswered: false })));
          
          // Set round data - this triggers audio playback
          setRoundNumber(round.round_number);
          setTimeLeft(ROUND_TIME);
          setRoundStartTime(Date.now());
          setCurrentRound(round);
          
          // Ensure game status is playing
          setGameStatus("playing");
          
          console.log("[Realtime] Round state updated, preview_url:", round.preview_url);
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
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] Channel status:", status);
      });

    return () => {
      supabase.removeChannel(roomChannel);
    };
  }, [room?.id]); // Don't re-subscribe on gameStatus change

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

        if (roomData) {
          // Check for status changes
          if (roomData.status === "playing" && gameStatus === "waiting") {
            console.log("[Poll] Room status changed to playing");
            setRoom(roomData as RoomData);
            setGameStatus("playing");
          }
          if (roomData.status === "finished" && gameStatus !== "results") {
            console.log("[Poll] Room status changed to finished");
            setRoom(roomData as RoomData);
            setGameStatus("results");
          }
          // Update current_round if changed
          if (roomData.current_round !== room.current_round) {
            setRoom(roomData as RoomData);
          }
        }

        // Poll for new rounds during gameplay
        if (gameStatus === "playing" || gameStatus === "between_rounds") {
          const { data: latestRound } = await supabase
            .from("game_rounds")
            .select("*")
            .eq("room_id", room.id)
            .order("round_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestRound && latestRound.round_number > roundNumber) {
            console.log("[Poll] New round detected:", latestRound.round_number);
            const round = latestRound as RoundData;
            if (typeof round.options === 'string') {
              round.options = JSON.parse(round.options);
            }

            // Reset time up handled ref
            timeUpHandledRef.current = null;

            // Reset state for new round
            setHasAnswered(false);
            setSelectedAnswer(null);
            setIsCorrect(null);
            setPlayers((prev) => prev.map((p) => ({ ...p, roundScore: 0, hasAnswered: false })));

            setRoundNumber(round.round_number);
            const elapsed = Date.now() - new Date(round.started_at).getTime();
            const remaining = Math.max(0, ROUND_TIME - elapsed);
            setTimeLeft(remaining);
            setRoundStartTime(new Date(round.started_at).getTime());
            setCurrentRound(round);
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
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [room?.id, gameStatus, roundNumber]);

  // Track if time up has been handled for current round
  const timeUpHandledRef = useRef<string | null>(null);
  
  // Timer effect
  useEffect(() => {
    if (gameStatus !== "playing" || !currentRound) return;
    
    // Reset time up handled when round changes
    if (timeUpHandledRef.current !== currentRound.id) {
      timeUpHandledRef.current = null;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 100) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameStatus, currentRound?.id]);

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
        } catch (err) {
          console.error("Error submitting empty answer:", err);
        }
      }
    };
    
    submitEmptyAnswer();
    
    // All players go to between_rounds
      setGameStatus("between_rounds");
      setNextQuestionType(QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)]);
      setBetweenRoundsCountdown(5);
  }, [timeLeft, currentRound?.id, room?.id, hasAnswered, playerId, isHost, roundNumber, gameStatus]);

  // Check if all players have answered → skip to next round early
  useEffect(() => {
    if (gameStatus !== "playing" || !currentRound || !room || players.length < 2) return;
    if (timeUpHandledRef.current === currentRound.id) return; // Already transitioning

    const allAnswered = players.every((p) => p.hasAnswered);
    if (allAnswered) {
      console.log("All players answered! Skipping to next round early.");
      timeUpHandledRef.current = currentRound.id;

      // Clear the timer
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);

      setGameStatus("between_rounds");
      setNextQuestionType(QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)]);
      setBetweenRoundsCountdown(5);
    }
  }, [players, gameStatus, currentRound?.id, room?.id]);
  // Host: countdown + trigger next round
  useEffect(() => {
    if (gameStatus !== "between_rounds" || !isHost || !room) return;

    console.log("Host starting between rounds countdown, roundNumber:", roundNumber);
    let countdown = 5;

    betweenRoundsRef.current = setInterval(async () => {
      countdown -= 1;
      setBetweenRoundsCountdown(countdown);

      if (countdown <= 0) {
        if (betweenRoundsRef.current) clearInterval(betweenRoundsRef.current);

        const currentTracks = tracksRef.current;
        const totalRounds = room.total_rounds || 10;

        if (roundNumber >= totalRounds) {
          console.log("Game ending");
          endGameRef.current?.();
        } else if (currentTracks.length > 0) {
          console.log("Starting next round:", roundNumber + 1, "tracks available:", currentTracks.length);
          await createRoundRef.current?.(currentTracks, roundNumber + 1);
        } else {
          console.error("No tracks available for next round!");
          toast.error("Failed to load next round - no tracks");
        }
      }
    }, 1000);

    return () => {
      if (betweenRoundsRef.current) clearInterval(betweenRoundsRef.current);
    };
  }, [gameStatus, isHost, room?.id, roundNumber]);

  // Non-host: local visual countdown only
  useEffect(() => {
    if (gameStatus !== "between_rounds" || isHost) return;

    let countdown = 5;
    const interval = setInterval(() => {
      countdown -= 1;
      setBetweenRoundsCountdown(Math.max(countdown, 0));
      if (countdown <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [gameStatus, isHost]);

  // Submit answer
  const submitAnswer = useCallback(async (answer: string) => {
    if (hasAnswered || !currentRound || !room || !playerId) return;

    const correct = answer === currentRound.artist_name;
    const answerTime = Date.now() - roundStartTime;
    const points = calculatePoints(correct, answerTime, ROUND_TIME);

    setSelectedAnswer(answer);
    setIsCorrect(correct);
    setHasAnswered(true);

    const currentPlayerScore = players.find((p) => p.player_id === playerId)?.score || 0;

    try {
      // Insert answer
      await supabase.from("player_answers").insert({
        room_id: room.id,
        round_id: currentRound.id,
        player_id: playerId,
        answer,
        is_correct: correct,
        points_earned: points,
      });

      // Update player score
      await supabase
        .from("room_players")
        .update({ score: currentPlayerScore + points })
        .eq("room_id", room.id)
        .eq("player_id", playerId);
    } catch (err) {
      console.error("Error submitting answer:", err);
    }
  }, [hasAnswered, currentRound, room, playerId, roundStartTime, players]);

  // Load tracks for the game
  const loadTracks = useCallback(async (category: string) => {
    const playlist = getPlaylistById(category) || PLAYLISTS[0];
    const result = await getPlaylistTracks(playlist.searchTerms, playlist.name, 50);
    if (result?.tracks) {
      setTracks(result.tracks);
      return result.tracks;
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
  const createRound = useCallback(async (availableTracks: AppleMusicTrack[], roundNum: number) => {
    if (!room) return;

    const track = availableTracks[roundNum - 1];
    if (!track) {
      await endGame();
      return;
    }

    // Generate options
    const otherArtists = availableTracks
      .filter((t) => t.trackId !== track.trackId && t.artistName !== track.artistName)
      .map((t) => t.artistName)
      .filter((a, i, arr) => arr.indexOf(a) === i)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [track.artistName, ...otherArtists].sort(() => Math.random() - 0.5);

    await supabase.from("game_rounds").insert({
      room_id: room.id,
      round_number: roundNum,
      track_id: track.trackId.toString(),
      track_name: track.trackName,
      artist_name: track.artistName,
      preview_url: track.previewUrl,
      options: JSON.stringify(options),
      artwork_url: track.artworkUrl100?.replace('100x100', '600x600') || '',
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

  const toggleReady = useCallback(async () => {
    if (!room || !playerId) return;

    const currentPlayer = players.find((p) => p.player_id === playerId);
    await supabase
      .from("room_players")
      .update({ is_ready: !currentPlayer?.is_ready })
      .eq("room_id", room.id)
      .eq("player_id", playerId);
  }, [room, playerId, players]);

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

  // Re-sync timer when tab becomes visible (handles background tab pause)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && gameStatus === 'playing' && currentRound) {
        // Recalculate time left based on server timestamp
        const elapsed = Date.now() - new Date(currentRound.started_at).getTime();
        const remaining = Math.max(0, ROUND_TIME - elapsed);
        console.log("Tab visible, syncing timer. Remaining:", remaining);
        setTimeLeft(remaining);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [gameStatus, currentRound]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (betweenRoundsRef.current) clearInterval(betweenRoundsRef.current);
    };
  }, []);

  return {
    room,
    players,
    loading,
    error,
    gameStatus,
    currentRound,
    roundNumber,
    timeLeft,
    hasAnswered,
    selectedAnswer,
    isCorrect,
    betweenRoundsCountdown,
    nextQuestionType,
    startGame,
    submitAnswer,
    toggleReady,
    leaveRoom,
    isHost,
    playerId,
    ROUND_TIME,
  };
}
