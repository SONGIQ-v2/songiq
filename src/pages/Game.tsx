import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, Trophy, Music2, X } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { RoundIndicator } from "@/components/RoundIndicator";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { AnswerOption } from "@/components/AnswerOption";
import { TimerBar } from "@/components/TimerBar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAppleMusic, type AppleMusicTrack } from "@/hooks/useAppleMusic";
import { useGameStore } from "@/lib/gameStore";
import { PLAYLISTS, getPlaylistById } from "@/lib/playlists";
import { calculatePoints } from "@/lib/spotify";

const ROUND_TIME = 15000; // 15 seconds per round
const TOTAL_ROUNDS = 10;

// Generate quiz options from tracks
function generateOptionsFromTracks(
  correctTrack: AppleMusicTrack,
  allTracks: AppleMusicTrack[],
  optionCount: number = 4
): string[] {
  const correctAnswer = correctTrack.artistName;
  
  // Get unique artists from other tracks
  const otherArtists = allTracks
    .filter((t) => t.trackId !== correctTrack.trackId && t.artistName !== correctTrack.artistName)
    .map((t) => t.artistName)
    .filter((artist, index, self) => self.indexOf(artist) === index) // unique
    .sort(() => Math.random() - 0.5)
    .slice(0, optionCount - 1);

  return [correctAnswer, ...otherArtists].sort(() => Math.random() - 0.5);
}

export default function Game() {
  const navigate = useNavigate();
  const { category: playlistId } = useGameStore();

  const { getPlaylistTracks, loading: loadingTracks, error: musicError } = useAppleMusic();
  const { soloScore, addSoloPoints, resetSoloGame } = useGameStore();

  const [gameState, setGameState] = useState<"loading" | "playing" | "answered" | "results">("loading");
  const [tracks, setTracks] = useState<AppleMusicTrack[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentTrack, setCurrentTrack] = useState<AppleMusicTrack | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [roundStartTime, setRoundStartTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlistName, setPlaylistName] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Get playlist info
  const playlist = getPlaylistById(playlistId) || PLAYLISTS[0];

  // Load tracks on mount
  useEffect(() => {
    resetSoloGame();
    loadTracks();
  }, [playlistId]);

  const loadTracks = async () => {
    if (!playlist) {
      console.error("No playlist found");
      return;
    }

    console.log("Loading tracks for playlist:", playlist.name);
    const result = await getPlaylistTracks(
      playlist.searchTerms,
      playlist.name,
      50
    );

    if (result && result.tracks.length >= TOTAL_ROUNDS) {
      console.log(`Loaded ${result.tracks.length} tracks`);
      setTracks(result.tracks);
      setPlaylistName(result.playlistName);
      startRound(result.tracks, 1);
    } else {
      console.error("Not enough tracks loaded:", result?.tracks.length || 0);
    }
  };

  const startRound = (availableTracks: AppleMusicTrack[], round: number) => {
    // Pick a random track for this round
    const shuffled = [...availableTracks].sort(() => Math.random() - 0.5);
    const track = shuffled[round - 1];
    
    if (!track) {
      setGameState("results");
      return;
    }

    console.log(`Round ${round}: Playing "${track.trackName}" by ${track.artistName}`);

    setCurrentTrack(track);
    setOptions(generateOptionsFromTracks(track, availableTracks));
    setSelectedAnswer(null);
    setIsCorrect(null);
    setTimeLeft(ROUND_TIME);
    setRoundStartTime(Date.now());
    setGameState("playing");
    setIsPlaying(true);

    // Start timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 100) {
          handleTimeout();
          return 0;
        }
        return prev - 100;
      });
    }, 100);
  };

  const handleTimeout = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsCorrect(false);
    setGameState("answered");
    setIsPlaying(false);
  };

  const handleAnswer = useCallback((answer: string) => {
    if (gameState !== "playing" || !currentTrack) return;

    if (timerRef.current) clearInterval(timerRef.current);

    const correctAnswer = currentTrack.artistName;
    const correct = answer === correctAnswer;
    const answerTime = Date.now() - roundStartTime;
    const points = calculatePoints(correct, answerTime, ROUND_TIME);

    setSelectedAnswer(answer);
    setIsCorrect(correct);
    addSoloPoints(points);
    setGameState("answered");
    setIsPlaying(false);
  }, [gameState, currentTrack, roundStartTime, addSoloPoints]);

  const handleNextRound = () => {
    if (currentRound >= TOTAL_ROUNDS) {
      setGameState("results");
    } else {
      setCurrentRound((prev) => prev + 1);
      startRound(tracks, currentRound + 1);
    }
  };

  const handlePlayAgain = () => {
    resetSoloGame();
    setCurrentRound(1);
    loadTracks();
  };

  // Audio handling
  useEffect(() => {
    if (currentTrack?.previewUrl && gameState === "playing") {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(currentTrack.previewUrl);
      audioRef.current.volume = isMuted ? 0 : 0.7;
      audioRef.current.play().catch(console.error);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [currentTrack, gameState]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : 0.7;
    }
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  if (gameState === "loading") {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <Starfield />
        <div className="text-center z-10">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 mx-auto mb-4"
          >
            <Music2 className="w-full h-full text-gold" />
          </motion.div>
          <p className="text-xl text-foreground/80">Loading {playlist?.name || "tracks"}...</p>
          {musicError && (
            <p className="text-red-400 mt-4">{musicError}</p>
          )}
        </div>
      </div>
    );
  }

  if (gameState === "results") {
    const maxScore = TOTAL_ROUNDS * 200;
    const percentage = Math.round((soloScore / maxScore) * 100);
    
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <Starfield />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card-african p-8 max-w-md w-full text-center z-10"
        >
          <Trophy className="w-20 h-20 text-gold mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-foreground mb-2">Game Complete!</h1>
          <p className="text-foreground/60 mb-6">{playlistName}</p>
          
          <div className="bg-background/50 rounded-xl p-6 mb-6">
            <p className="text-5xl font-bold text-gold mb-2">{soloScore}</p>
            <p className="text-foreground/60">points</p>
            <div className="mt-4 h-3 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 1, delay: 0.5 }}
                className="h-full bg-gradient-to-r from-gold to-terracotta"
              />
            </div>
            <p className="text-sm text-foreground/60 mt-2">{percentage}% accuracy</p>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/solo")}
            >
              Categories
            </Button>
            <Button
              variant="gold"
              className="flex-1"
              onClick={handlePlayAgain}
            >
              Play Again
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Starfield />
      
      {/* Header */}
      <div className="relative z-10 p-4 flex items-center justify-between safe-area-inset-top">
        <div className="flex items-center gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-foreground/60 hover:text-destructive hover:bg-destructive/10"
              >
                <X className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave Game?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to quit? Your current progress will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Playing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    resetSoloGame();
                    navigate("/solo");
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Leave Game
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <RoundIndicator currentRound={currentRound} totalRounds={TOTAL_ROUNDS} />
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-foreground/60">Score</p>
            <p className="text-xl font-bold text-gold">{soloScore}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMuted(!isMuted)}
            className="text-foreground/60 hover:text-foreground"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Timer */}
      <div className="px-4">
        <TimerBar timeLeft={timeLeft} maxTime={ROUND_TIME} />
      </div>

      {/* Main game area */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4 py-8">
        {/* Album art / Visualizer */}
        <motion.div
          key={currentRound}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative mb-8"
        >
          {gameState === "answered" && currentTrack ? (
            <div className="w-48 h-48 rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={currentTrack.artworkUrl100.replace('100x100', '600x600')}
                alt={currentTrack.collectionName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-48 h-48 rounded-2xl bg-card flex items-center justify-center shadow-2xl border border-border">
              <AudioVisualizer isPlaying={isPlaying} />
            </div>
          )}
        </motion.div>

        {/* Song info (shown after answer) */}
        <AnimatePresence>
          {gameState === "answered" && currentTrack && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center mb-6"
            >
              <h2 className="text-xl font-bold text-foreground">{currentTrack.trackName}</h2>
              <p className="text-foreground/60">{currentTrack.artistName}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Answer options - 2x2 grid */}
        <div className="w-full max-w-2xl grid grid-cols-2 gap-3">
          {options.map((option, index) => {
            const correctAnswer = currentTrack?.artistName || "";
            
            return (
              <AnswerOption
                key={`${currentRound}-${index}`}
                option={option}
                index={index}
                isSelected={selectedAnswer === option}
                isCorrect={option === correctAnswer}
                isRevealed={gameState === "answered"}
                disabled={gameState === "answered"}
                onClick={() => handleAnswer(option)}
              />
            );
          })}
        </div>

        {/* Next button */}
        <AnimatePresence>
          {gameState === "answered" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8"
            >
              <Button variant="gold" size="lg" onClick={handleNextRound}>
                {currentRound >= TOTAL_ROUNDS ? "See Results" : "Next Song"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
