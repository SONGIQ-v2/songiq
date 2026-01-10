import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, Music2, Trophy, X } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { RoundIndicator } from "@/components/RoundIndicator";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { AnswerOption } from "@/components/AnswerOption";
import { TimerBar } from "@/components/TimerBar";
import { Leaderboard } from "@/components/Leaderboard";
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
import { useMultiplayerGame } from "@/hooks/useMultiplayerGame";

export default function MultiplayerGame() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
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
    submitAnswer,
    leaveRoom,
    playerId,
    ROUND_TIME,
  } = useMultiplayerGame(code || "");

  // Audio handling
  useEffect(() => {
    if (currentRound?.preview_url && gameStatus === "playing" && !hasAnswered) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(currentRound.preview_url);
      audioRef.current.volume = isMuted ? 0 : 0.7;
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [currentRound?.id, gameStatus]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : 0.7;
    }
  }, [isMuted]);

  // Stop playing when answered
  useEffect(() => {
    if (hasAnswered) {
      setIsPlaying(false);
    }
  }, [hasAnswered]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const handleLeaveGame = async () => {
    if (audioRef.current) audioRef.current.pause();
    await leaveRoom();
    navigate("/multiplayer");
  };

  const handleAnswer = (answer: string) => {
    if (!hasAnswered) {
      submitAnswer(answer);
    }
  };

  // Loading state
  if (loading) {
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
          <p className="text-xl text-foreground/80">Loading game...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !room) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <Starfield />
        <div className="text-center z-10">
          <p className="text-destructive mb-4">{error || "Game not found"}</p>
          <Button onClick={() => navigate("/multiplayer")}>Back to Multiplayer</Button>
        </div>
      </div>
    );
  }

  // Results screen
  if (gameStatus === "results") {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];
    const currentPlayerRank = sortedPlayers.findIndex((p) => p.player_id === playerId) + 1;

    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <Starfield />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card-african p-8 max-w-lg w-full text-center z-10"
        >
          <Trophy className="w-20 h-20 text-gold mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-foreground mb-2">Game Over!</h1>
          
          {winner && (
            <div className="mb-6">
              <p className="text-muted-foreground mb-2">Winner</p>
              <p className="text-2xl font-bold text-gold">{winner.player_name}</p>
              <p className="text-lg text-foreground/80">{winner.score} points</p>
            </div>
          )}

          <div className="bg-background/50 rounded-xl p-4 mb-6">
            <p className="text-muted-foreground mb-2">Your Position</p>
            <p className="text-4xl font-bold text-primary">#{currentPlayerRank}</p>
            <p className="text-foreground/60">
              {players.find((p) => p.player_id === playerId)?.score || 0} points
            </p>
          </div>

          {/* Final Leaderboard */}
          <div className="mb-6">
            <Leaderboard players={players} currentPlayerId={playerId} compact />
          </div>

          <Button variant="gold" size="lg" className="w-full" onClick={() => navigate("/multiplayer")}>
            Play Again
          </Button>
        </motion.div>
      </div>
    );
  }

  // Between rounds
  if (gameStatus === "between_rounds") {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <Starfield />
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl z-10">
          {/* Round Results */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex-1 text-center"
          >
            <h2 className="text-2xl font-bold text-foreground mb-4">Round {roundNumber} Complete!</h2>
            
            {currentRound && (
              <div className="game-card mb-6">
                <img
                  src={`https://is1-ssl.mzstatic.com/image/thumb/${currentRound.track_id}/600x600bb.jpg`}
                  alt={currentRound.track_name}
                  className="w-32 h-32 rounded-xl mx-auto mb-4 object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.svg";
                  }}
                />
                <h3 className="text-xl font-bold">{currentRound.track_name}</h3>
                <p className="text-muted-foreground">{currentRound.artist_name}</p>
              </div>
            )}

            <div className="text-6xl font-bold text-primary mb-2">{betweenRoundsCountdown}</div>
            <p className="text-muted-foreground">Next round starting...</p>
          </motion.div>

          {/* Leaderboard */}
          <div className="lg:w-80">
            <Leaderboard players={players} currentPlayerId={playerId} showRoundScore />
          </div>
        </div>
      </div>
    );
  }

  // Main game screen
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Starfield />

      <div className="relative z-10 flex flex-col lg:flex-row h-screen">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 flex items-center justify-between safe-area-inset-top">
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
                      Are you sure you want to quit? You'll lose your progress in this game.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Playing</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLeaveGame}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Leave Game
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <RoundIndicator currentRound={roundNumber} totalRounds={room.total_rounds} />
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-foreground/60">Your Score</p>
                <p className="text-xl font-bold text-gold">
                  {players.find((p) => p.player_id === playerId)?.score || 0}
                </p>
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
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
            {/* Album art / Visualizer */}
            <motion.div
              key={roundNumber}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative mb-8"
            >
              {hasAnswered && currentRound ? (
                <div className="w-48 h-48 rounded-2xl overflow-hidden shadow-2xl">
                  <img
                    src={`https://is1-ssl.mzstatic.com/image/thumb/${currentRound.track_id}/600x600bb.jpg`}
                    alt={currentRound.track_name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.svg";
                    }}
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
              {hasAnswered && currentRound && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center mb-6"
                >
                  <h2 className="text-xl font-bold text-foreground">{currentRound.track_name}</h2>
                  <p className="text-foreground/60">{currentRound.artist_name}</p>
                  <div className={`mt-2 text-lg font-bold ${isCorrect ? "text-green-500" : "text-red-500"}`}>
                    {isCorrect ? "Correct! 🎉" : "Wrong!"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Answer options - 2x2 grid */}
            <div className="w-full max-w-2xl grid grid-cols-2 gap-3">
              {currentRound?.options.map((option, index) => {
                const correctAnswer = currentRound.artist_name;

                return (
                  <AnswerOption
                    key={`${roundNumber}-${index}`}
                    option={option}
                    index={index}
                    isSelected={selectedAnswer === option}
                    isCorrect={option === correctAnswer}
                    isRevealed={hasAnswered}
                    disabled={hasAnswered}
                    onClick={() => handleAnswer(option)}
                  />
                );
              })}
            </div>

            {/* Waiting indicator after answering */}
            {hasAnswered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-muted-foreground"
              >
                Waiting for other players...
              </motion.div>
            )}
          </div>
        </div>

        {/* Sidebar Leaderboard - Desktop */}
        <div className="hidden lg:block w-80 p-4 border-l border-border bg-background/50 backdrop-blur-sm">
          <Leaderboard players={players} currentPlayerId={playerId} showRoundScore />
        </div>

        {/* Mobile Leaderboard - Bottom Sheet Style */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border p-3 safe-area-inset-bottom">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[...players]
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map((player, index) => (
                <div
                  key={player.player_id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full whitespace-nowrap ${
                    player.player_id === playerId ? "bg-primary/20" : "bg-muted"
                  }`}
                >
                  <span className="font-bold text-sm">{index + 1}</span>
                  <span className="text-sm truncate max-w-[60px]">{player.player_name}</span>
                  <span className="text-sm font-bold text-gold">{player.score}</span>
                  {player.hasAnswered && (
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
