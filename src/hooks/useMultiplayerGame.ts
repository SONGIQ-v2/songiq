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
}

const ROUND_TIME = 20000; // 20 seconds per round
const BETWEEN_ROUNDS_TIME = 4000; // 4 seconds between rounds

export function useMultiplayerGame(roomCode: string) {
  const { playerId, isHost } = useGameStore();
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

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const betweenRoundsRef = useRef<NodeJS.Timeout | null>(null);

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
        setGameStatus("playing");
        
        // Fetch current round if game is in progress
        const { data: roundData, error: roundError } = await supabase
          .from("game_rounds")
          .select("*")
          .eq("room_id", roomData.id)
          .eq("round_number", roomData.current_round)
          .single();
          
        if (!roundError && roundData) {
          const round = roundData as RoundData;
          // Parse options if it's a string
          if (typeof round.options === 'string') {
            round.options = JSON.parse(round.options);
          }
          setCurrentRound(round);
          setRoundNumber(round.round_number);
          setRoundStartTime(new Date(round.started_at).getTime());
          
          // Calculate remaining time based on when round started
          const elapsed = Date.now() - new Date(round.started_at).getTime();
          const remaining = Math.max(0, ROUND_TIME - elapsed);
          setTimeLeft(remaining);
          
          // Check if this player has already answered this round
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

    // Subscribe to room changes
    const roomChannel = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          if (payload.new) {
            const newRoom = payload.new as RoomData;
            setRoom(newRoom);
            if (newRoom.status === "playing" && gameStatus === "waiting") {
              setGameStatus("playing");
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
          console.log("New round received:", payload.new);
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
          
          console.log("Round state updated, preview_url:", round.preview_url);
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
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
    };
  }, [room?.id, gameStatus]);

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
    
    // Submit empty answer if not answered
    const submitEmptyAnswer = async () => {
      if (!hasAnswered && playerId) {
        try {
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
    setBetweenRoundsCountdown(4);
    
    // Only host triggers next round
    if (isHost) {
      console.log("Host starting between rounds countdown");
      let countdown = 4;
      
      betweenRoundsRef.current = setInterval(() => {
        countdown -= 1;
        setBetweenRoundsCountdown(countdown);
        
        if (countdown <= 0) {
          if (betweenRoundsRef.current) clearInterval(betweenRoundsRef.current);
          
          // Check if game should end
          if (roundNumber >= (room.total_rounds || 10)) {
            console.log("Game ending");
            endGame();
          } else {
            console.log("Starting next round:", roundNumber + 1);
            startNextRound();
          }
        }
      }, 1000);
    }
  }, [timeLeft, currentRound?.id, room?.id, hasAnswered, playerId, isHost, roundNumber, gameStatus]);

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

  // Toggle ready status
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
  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

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
    startGame,
    submitAnswer,
    toggleReady,
    leaveRoom,
    isHost,
    playerId,
    ROUND_TIME,
  };
}
