import { useState, useEffect, useRef, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, Trophy, Music2, X, Share2 } from "lucide-react";
import { toast } from "sonner";
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
import { logError, logWarn, logInfo } from "@/lib/clientLogger";
import { warmAudioUrl, preloadAudio, playWithUnmute, fetchAudioObjectUrl } from "@/lib/audioPreload";
import { buildShareText, shareResult } from "@/lib/shareCard";
import { shareResultImage } from "@/lib/shareImage";
import {
  createChallenge,
  challengeUrl,
  getSavedUsername,
  submitChallengeAttempt,
  fetchChallengeAttempts,
  type Challenge,
  type ChallengeRound,
  type ChallengeAttempt,
} from "@/lib/challenges";

const DEFAULT_ROUND_TIME = 15000; // 15 seconds per round
const DEFAULT_TOTAL_ROUNDS = 10;
const COUNTDOWN_TIME = 3; // 3 seconds countdown between rounds

type QuestionType = "artist" | "song";

// Generate quiz options from tracks based on question type
function generateOptionsFromTracks(
  correctTrack: AppleMusicTrack,
  allTracks: AppleMusicTrack[],
  questionType: QuestionType,
  optionCount: number = 4
): string[] {
  const correctAnswer = questionType === "artist" 
    ? correctTrack.artistName 
    : correctTrack.trackName;
  
  // Get unique options from other tracks
  const otherOptions = allTracks
    .filter((t) => t.trackId !== correctTrack.trackId)
    .map((t) => questionType === "artist" ? t.artistName : t.trackName)
    .filter((option) => option !== correctAnswer) // exclude correct answer
    .filter((option, index, self) => self.indexOf(option) === index) // unique
    .sort(() => Math.random() - 0.5)
    .slice(0, optionCount - 1);

  return [correctAnswer, ...otherOptions].sort(() => Math.random() - 0.5);
}

export default function Game() {
  const navigate = useNavigate();
  const location = useLocation();

  // Challenge replay: /c/:code navigates here with the original game's plan,
  // so this game uses those exact tracks, question types and options.
  const challenge = (location.state as { challenge?: Challenge } | null)?.challenge ?? null;
  const ROUND_TIME = (challenge ? challenge.time_per_round : DEFAULT_ROUND_TIME / 1000) * 1000;
  const TOTAL_ROUNDS = challenge ? challenge.plan.length : DEFAULT_TOTAL_ROUNDS;

  const { category: playlistId, playerName, playerId, initializeAuth } = useGameStore();

  const { getPlaylistTracks, loading: loadingTracks, error: musicError } = useAppleMusic();
  const { soloScore, addSoloPoints, resetSoloGame } = useGameStore();

  const [gameState, setGameState] = useState<"loading" | "playing" | "answered" | "countdown" | "results">("loading");
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
  const [countdown, setCountdown] = useState(COUNTDOWN_TIME);
  const [questionType, setQuestionType] = useState<QuestionType>("artist");
  const [nextQuestionType, setNextQuestionType] = useState<QuestionType>("song");
  const [roundResults, setRoundResults] = useState<boolean[]>([]);
  const [challengeAttempts, setChallengeAttempts] = useState<ChallengeAttempt[] | null>(null);

  // Rounds captured as played, so a normal game can be shared as a challenge
  const planRef = useRef<ChallengeRound[]>([]);
  const createdChallengeRef = useRef<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedForUrlRef = useRef<string | null>(null);
  // Background-downloaded clips: previewUrl -> in-memory object URL
  const audioUrlCacheRef = useRef<Map<string, string>>(new Map());
  const bgPreloadCancelRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup function to stop all audio and timers
  const cleanupGame = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (preloadedAudioRef.current) {
      preloadedAudioRef.current.pause();
      preloadedAudioRef.current.src = '';
      preloadedAudioRef.current = null;
    }
    bgPreloadCancelRef.current = true;
    for (const url of audioUrlCacheRef.current.values()) URL.revokeObjectURL(url);
    audioUrlCacheRef.current.clear();
  }, []);

  // Get playlist info
  const playlist = getPlaylistById(playlistId) || PLAYLISTS[0];

  // Load tracks on mount
  useEffect(() => {
    resetSoloGame();
    loadTracks();
  }, [playlistId]);

  const loadTracks = async () => {
    if (challenge) {
      // Challenge replay: rounds come from the stored plan, not iTunes
      const planTracks: AppleMusicTrack[] = challenge.plan.map((r, i) => ({
        trackId: Number(r.track_id) || i + 1,
        trackName: r.track_name,
        artistName: r.artist_name,
        collectionName: "",
        artworkUrl100: r.artwork_url || "",
        previewUrl: r.preview_url,
        trackTimeMillis: 0,
        primaryGenreName: "",
      }));
      setRoundResults([]);
      setTracks(planTracks);
      setPlaylistName(challenge.category_name);
      warmAudioUrl(planTracks[0]?.previewUrl);
      warmAudioUrl(planTracks[1]?.previewUrl);
      startRound(planTracks, 1);
      return;
    }

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
      // Shuffle tracks once and use this order for all rounds
      const shuffledTracks = [...result.tracks].sort(() => Math.random() - 0.5);
      setRoundResults([]);
      planRef.current = [];
      createdChallengeRef.current = null;
      setTracks(shuffledTracks);
      setPlaylistName(result.playlistName);
      // Warm CDN for the first track so round 1 starts faster.
      warmAudioUrl(shuffledTracks[0]?.previewUrl);
      // Also warm round 2 so the first countdown preload is instant.
      warmAudioUrl(shuffledTracks[1]?.previewUrl);
      startRound(shuffledTracks, 1);
    } else {
      console.error("Not enough tracks loaded:", result?.tracks.length || 0);
      logError("solo.tracks_load_failed", "Solo game failed to load enough tracks", {
        playlistId: playlist.id,
        playlistName: playlist.name,
        loaded: result?.tracks.length ?? 0,
        required: TOTAL_ROUNDS,
        musicError,
      });
    }
  };

  const startRound = (availableTracks: AppleMusicTrack[], round: number) => {
    // Use the pre-shuffled track for this round (no re-shuffling to avoid repeats)
    const track = availableTracks[round - 1];
    
    if (!track) {
      setGameState("results");
      return;
    }

    // Question type and options come from the challenge plan when replaying;
    // otherwise they're generated fresh
    const planRound = challenge?.plan[round - 1];
    const roundQuestionType: QuestionType =
      planRound?.question_type ?? (Math.random() > 0.5 ? "artist" : "song");
    setQuestionType(roundQuestionType);

    // Pre-determine next round's question type for the hint
    const nextRoundQuestionType: QuestionType =
      challenge?.plan[round]?.question_type ?? (Math.random() > 0.5 ? "artist" : "song");
    setNextQuestionType(nextRoundQuestionType);

    console.log(`Round ${round}: Playing "${track.trackName}" by ${track.artistName} - Question: ${roundQuestionType}`);

    const roundOptions =
      planRound?.options ?? generateOptionsFromTracks(track, availableTracks, roundQuestionType);

    // Record the round so this game can be shared as a challenge link
    if (!challenge) {
      planRef.current[round - 1] = {
        track_id: String(track.trackId),
        track_name: track.trackName,
        artist_name: track.artistName,
        preview_url: track.previewUrl,
        artwork_url: track.artworkUrl100?.replace("100x100", "600x600") || "",
        question_type: roundQuestionType,
        options: roundOptions,
      };
    }

    setCurrentTrack(track);
    setOptions(roundOptions);
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
    setRoundResults((prev) => [...prev, false]);
    setGameState("answered");
    setIsPlaying(false);
    logWarn("solo.answer_timeout", "Solo player did not answer in time", {
      round: currentRound,
      trackId: currentTrack?.trackId,
      questionType,
    });
  };

  const handleAnswer = useCallback((answer: string) => {
    if (gameState !== "playing" || !currentTrack) return;

    if (timerRef.current) clearInterval(timerRef.current);

    const correctAnswer = questionType === "artist" 
      ? currentTrack.artistName 
      : currentTrack.trackName;
    const correct = answer === correctAnswer;
    const answerTime = Date.now() - roundStartTime;
    const points = calculatePoints(correct, answerTime, ROUND_TIME);

    setSelectedAnswer(answer);
    setIsCorrect(correct);
    setRoundResults((prev) => [...prev, correct]);
    addSoloPoints(points);
    setGameState("answered");
    setIsPlaying(false);
  }, [gameState, currentTrack, roundStartTime, addSoloPoints]);

  const handleNextRound = useCallback(() => {
    if (currentRound >= TOTAL_ROUNDS) {
      setGameState("results");
    } else {
      setCurrentRound((prev) => prev + 1);
      startRound(tracks, currentRound + 1);
    }
  }, [currentRound, tracks]);

  // Start countdown after answering
  useEffect(() => {
    if (gameState === "answered") {
      // Start 3-second countdown after a brief delay to show the answer
      const delayTimer = setTimeout(() => {
        setGameState("countdown");
        setCountdown(COUNTDOWN_TIME);
      }, 1000); // 1 second delay to show answer feedback

      return () => clearTimeout(delayTimer);
    }
  }, [gameState]);

  // Countdown timer logic
  useEffect(() => {
    if (gameState === "countdown") {
      if (countdownRef.current) clearInterval(countdownRef.current);
      
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            handleNextRound();
            return COUNTDOWN_TIME;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    }
  }, [gameState, handleNextRound]);

  const handlePlayAgain = () => {
    resetSoloGame();
    setCurrentRound(1);
    loadTracks();
  };

  // Pre-create the challenge link when results appear, so tapping Share stays
  // within the browser's user-gesture window (navigator.share requires it).
  useEffect(() => {
    if (gameState !== "results") return;
    if (challenge || createdChallengeRef.current || planRef.current.length === 0) return;
    createChallenge({
      creator_name: playerName || getSavedUsername() || "A music fan",
      creator_score: soloScore,
      category_name: playlistName || playlist?.name || "Music Quiz",
      time_per_round: ROUND_TIME / 1000,
      plan: planRef.current,
    }).then((code) => {
      createdChallengeRef.current = code;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Challenge replay finished: record this player's (single) attempt, then
  // load the leaderboard. The DB unique constraint makes retries no-ops.
  useEffect(() => {
    if (gameState !== "results" || !challenge) return;
    (async () => {
      const pid = playerId ?? (await initializeAuth());
      if (pid) {
        await submitChallengeAttempt(
          challenge.code,
          pid,
          playerName || getSavedUsername() || "A music fan",
          soloScore,
          roundResults.filter(Boolean).length
        );
      }
      setChallengeAttempts(await fetchChallengeAttempts(challenge.code));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Background queue: while the game plays, download the remaining rounds'
  // clips one at a time into in-memory object URLs, so every later round
  // starts instantly regardless of connection speed. Solo-only — the device
  // already knows all tracks, so there's nothing to keep secret.
  useEffect(() => {
    if (tracks.length === 0) return;
    bgPreloadCancelRef.current = false;

    (async () => {
      // Round 1 streams normally; queue rounds 2..N
      for (const track of tracks.slice(1, TOTAL_ROUNDS)) {
        if (bgPreloadCancelRef.current) return;
        if (!track.previewUrl || audioUrlCacheRef.current.has(track.previewUrl)) continue;
        const objUrl = await fetchAudioObjectUrl(track.previewUrl);
        if (bgPreloadCancelRef.current) {
          if (objUrl) URL.revokeObjectURL(objUrl);
          return;
        }
        if (objUrl) audioUrlCacheRef.current.set(track.previewUrl, objUrl);
      }
    })();

    return () => {
      bgPreloadCancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // Preload the next round's audio during the countdown so it can start instantly.
  useEffect(() => {
    if (gameState !== "countdown") return;
    if (currentRound >= TOTAL_ROUNDS) return;
    const nextTrack = tracks[currentRound]; // currentRound is 1-indexed; next = tracks[currentRound]
    if (!nextTrack?.previewUrl) return;

    const cachedSrc = audioUrlCacheRef.current.get(nextTrack.previewUrl);
    if (!cachedSrc) warmAudioUrl(nextTrack.previewUrl);
    const { audio } = preloadAudio(cachedSrc ?? nextTrack.previewUrl, {
      timeoutMs: 2500,
      volume: isMuted ? 0 : 0.7,
    });
    // Discard any previously preloaded audio.
    if (preloadedAudioRef.current) {
      preloadedAudioRef.current.pause();
      preloadedAudioRef.current.src = "";
    }
    preloadedAudioRef.current = audio;
    preloadedForUrlRef.current = nextTrack.previewUrl;
  }, [gameState, currentRound, tracks, isMuted]);

  // Audio handling
  useEffect(() => {
    // Stop any existing audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    if (currentTrack?.previewUrl && gameState === "playing") {
      const desiredVolume = isMuted ? 0 : 0.7;
      // Reuse the preloaded element if it matches the current track.
      let audio: HTMLAudioElement;
      const preloaded = preloadedAudioRef.current;
      if (preloaded && preloadedForUrlRef.current === currentTrack.previewUrl) {
        audio = preloaded;
        audio.volume = desiredVolume;
        preloadedAudioRef.current = null;
        preloadedForUrlRef.current = null;
      } else {
        // Fall back to the background-downloaded blob, then the network
        const src = audioUrlCacheRef.current.get(currentTrack.previewUrl) ?? currentTrack.previewUrl;
        audio = new Audio(src);
        audio.preload = "auto";
        audio.volume = desiredVolume;
      }
      audioRef.current = audio;
      playWithUnmute(audio, desiredVolume).catch((err) => {
        console.error(err);
        logError("solo.audio_play_failed", "Solo audio playback failed", {
          round: currentRound,
          trackId: currentTrack.trackId,
          trackName: currentTrack.trackName,
          previewUrl: currentTrack.previewUrl,
          error: (err as Error)?.message,
        }, (err as Error)?.stack);
      });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
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
      cleanupGame();
    };
  }, [cleanupGame]);

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

    const handleShare = async () => {
      // Reuse the incoming challenge's link, or the one created for this game
      const code = challenge?.code ?? createdChallengeRef.current;
      const cardOpts = {
        categoryName: playlistName || playlist?.name || "Music Quiz",
        score: soloScore,
        results: roundResults,
        challengeUrl: code ? challengeUrl(code) : undefined,
      };
      const text = buildShareText(cardOpts);

      const imageOutcome = await shareResultImage(cardOpts, text);
      if (imageOutcome === "shared" || imageOutcome === "canceled") return;
      if (imageOutcome === "downloaded") {
        toast.success("Image saved — result text copied too!");
        return;
      }

      // Image path failed — fall back to text-only share
      const outcome = await shareResult(text);
      if (outcome === "copied") toast.success("Result copied — paste it anywhere!");
      if (outcome === "failed") toast.error("Couldn't share your result");
    };

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
            {roundResults.length > 0 && (
              <p className="text-lg mt-3 tracking-wider" aria-hidden="true">
                {roundResults.map((r) => (r ? "🟩" : "🟥")).join("")}
              </p>
            )}
          </div>

          {challenge && (
            <div className="bg-background/50 rounded-xl p-4 mb-6">
              <p className="mb-3 font-semibold text-foreground">
                {soloScore > challenge.creator_score
                  ? `🏆 You beat ${challenge.creator_name}'s ${challenge.creator_score}!`
                  : soloScore === challenge.creator_score
                  ? `🤝 You tied ${challenge.creator_name}'s ${challenge.creator_score}!`
                  : `👑 ${challenge.creator_name} keeps the crown (${challenge.creator_score})`}
              </p>
              {(() => {
                const board = [
                  {
                    name: challenge.creator_name,
                    score: challenge.creator_score,
                    isMe: false,
                    isCreator: true,
                  },
                  ...(challengeAttempts ?? []).map((a) => ({
                    name: a.player_name,
                    score: a.score,
                    isMe: a.player_id === playerId,
                    isCreator: false,
                  })),
                ].sort((a, b) => b.score - a.score);
                const myRank = board.findIndex((e) => e.isMe) + 1;
                return (
                  <div className="text-left">
                    <p className="text-muted-foreground text-sm text-center mb-2">
                      {myRank > 0
                        ? `You're #${myRank} of ${board.length} on this challenge`
                        : "Challenge leaderboard"}
                    </p>
                    <div className="space-y-1.5">
                      {board.slice(0, 5).map((e, i) => (
                        <div
                          key={`${e.name}-${i}`}
                          className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${
                            e.isMe ? "bg-primary/15 border border-primary/40" : "bg-card/50"
                          }`}
                        >
                          <span className="font-semibold text-foreground">
                            #{i + 1} {e.name} {e.isCreator && "👑"} {e.isMe && <span className="text-primary text-xs">(you)</span>}
                          </span>
                          <span className="font-bold text-gold">{e.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <Button variant="gold" size="lg" className="w-full mb-4" onClick={handleShare}>
            <Share2 className="w-5 h-5 mr-2" />
            Share Result
          </Button>

          {challenge ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/solo")}
            >
              Play More Music Quizzes
            </Button>
          ) : (
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
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>Solo Music Quiz — Play Now | SongIQ</title>
        <meta name="description" content="Solo music quiz round in progress on SongIQ. Listen to 15-second clips and guess the song or artist." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href="https://songiq.xyz/solo/game" />
        <meta property="og:title" content="Solo Music Quiz — Play Now | SongIQ" />
        <meta property="og:description" content="Live solo round on SongIQ — guess the song or artist in 15 seconds." />
        <meta property="og:url" content="https://songiq.xyz/solo/game" />
      </Helmet>
      <Starfield />
      <h1 className="sr-only">Solo Music Quiz Gameplay</h1>
      
      
      {/* Header */}
      <div className="relative z-10 p-4 flex items-center justify-between safe-area-inset-top">
        <div className="flex items-center gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                aria-label="Leave game"
                className="bg-destructive/90 hover:bg-destructive shadow-md"
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
                    cleanupGame();
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
            aria-label={isMuted ? "Unmute audio" : "Mute audio"}
            onClick={() => setIsMuted(!isMuted)}
            className="text-foreground/60 hover:text-foreground"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Timer */}
      <div className="px-4">
        <TimerBar key={currentRound} timeLeft={timeLeft} maxTime={ROUND_TIME} />
      </div>

      {/* Main game area */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4 py-8">
        {/* Question Type Indicator */}
        <motion.div
          key={`${currentRound}-${questionType}`}
          initial={{ opacity: 0, scale: 0.9, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="mb-6 px-6 py-3 rounded-xl bg-gold shadow-lg shadow-gold/30"
        >
          <p className="text-lg font-bold text-background tracking-wide">
            {questionType === "artist" ? "🎤 GUESS THE ARTIST" : "🎵 GUESS THE SONG"}
          </p>
        </motion.div>

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
            const correctAnswer = questionType === "artist"
              ? currentTrack?.artistName || ""
              : currentTrack?.trackName || "";
            
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

        {/* Countdown Overlay */}
        <AnimatePresence>
          {gameState === "countdown" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            >
              <div className="text-center">
                {/* Circular Loader */}
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="none"
                      className="text-foreground/20"
                    />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="45"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="none"
                      className="text-gold"
                      strokeLinecap="round"
                      initial={{ strokeDashoffset: 0 }}
                      animate={{ strokeDashoffset: 283 }}
                      transition={{ duration: 3, ease: "linear" }}
                      style={{
                        strokeDasharray: 283,
                      }}
                    />
                  </svg>
                </div>
                
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-2xl font-bold text-gold mb-2"
                >
                  Up Next
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-lg text-foreground/60"
                >
                  {currentRound >= TOTAL_ROUNDS ? "See your results" : nextQuestionType === "artist" ? "Guess the Artist" : "Guess the Song"}
                </motion.p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
