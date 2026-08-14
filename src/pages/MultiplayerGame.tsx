import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { Music2, Trophy, X, AlertTriangle, LogOut, UserCircle, Share2, Star, WifiOff, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Starfield } from "@/components/Starfield";
import songiqLogo from "@/assets/songiq-logo.png";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { AnswerOption } from "@/components/AnswerOption";
import { Leaderboard } from "@/components/Leaderboard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Podium } from "@/components/Podium";
import { Button } from "@/components/ui/button";
import { VolumeControl } from "@/components/VolumeControl";
import { ReactionBar, FloatingReactions } from "@/components/EmojiReactions";
import { useVolume } from "@/hooks/useVolume";
import { logError, logWarn, logInfo } from "@/lib/clientLogger";
import { warmAudioUrl, preloadAudio, playWithWatchdog } from "@/lib/audioPreload";
import { isIOS } from "@/lib/ios";
import { CARD_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
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
import { useGameStore } from "@/lib/gameStore";
import { supabase } from "@/integrations/supabase/client";
import { PLAYLISTS } from "@/lib/playlists";
import { buildShareText, shareResult } from "@/lib/shareCard";
import { shareResultImage } from "@/lib/shareImage";
import { createChallenge, challengeUrl } from "@/lib/challenges";
import { trackEvent } from "@/lib/analytics";



const INACTIVITY_WARNING_TIME = 30000; // 30 seconds
const TERMINATION_COUNTDOWN = 10; // 10 seconds

// Force HMR reset v2 - hook order stabilized
export default function MultiplayerGame() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [volume, setVolume] = useVolume();
  const [isPlaying, setIsPlaying] = useState(false);
  const [slowConnection, setSlowConnection] = useState(false);
  // iOS Safari-only autoplay fallback: the automatic playWithWatchdog call
  // below never runs inside a user gesture, so unmuted playback routinely
  // stalls or rejects with NotAllowedError there specifically. When that
  // happens on iOS, this drives a small "Tap for sound" chip whose click
  // handler calls play() synchronously in the gesture -- the only reliable
  // way to unlock audible sound. Never set on Android/desktop, where
  // autoplay already just works.
  const [needsSoundUnlock, setNeedsSoundUnlock] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Tracks which element the waiting/playing listeners below are currently
  // attached to, so they can be detached from the right element when a new
  // round's audio replaces it (the element itself persists across
  // between_rounds/pre_game/playing transitions within the same round).
  const audioListenersRef = useRef<{ audio: HTMLAudioElement; onWaiting: () => void; onPlaying: () => void } | null>(null);
  // The raw preview_url audioRef.current was last prepared for. Compared
  // against currentRound.preview_url as-is, not via audioRef.current.src --
  // the DOM resolves .src to an absolute, normalized URL that isn't
  // guaranteed to string-match the raw value, which would wrongly read as
  // "different track" and discard an element that's already preloaded (or
  // fully cached) for no reason.
  const preloadedForUrlRef = useRef<string | null>(null);

  // Per-round correctness for the share card, fetched once the game ends
  const [myResults, setMyResults] = useState<boolean[]>([]);
  const challengeCodeRef = useRef<string | null>(null);
  // Points earned this game + running total, for the results screen chip
  const [pointsResult, setPointsResult] = useState<{ earned: number; total: number } | null>(null);

  // Inactivity state
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [terminationCountdown, setTerminationCountdown] = useState(TERMINATION_COUNTDOWN);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    preGameCountdown,
    isFinalizingResults,
    nextQuestionType,
    currentQuestionType,
    revealActive,
    roundAnswers,
    reactions,
    sendReaction,
    verifiedPlayerIds,
    submitAnswer,
    leaveRoom,
    playAgain,
    isHost: isHostPlayer,
    playerId,
    ROUND_TIME,
    isTerminated,
    endGameNow,
  } = useMultiplayerGame(code || "");

  // True for a player who joined after the current round already started
  // (mid-round join) -- they can't meaningfully answer a question they
  // arrived partway through, so they see a "waiting for next round" state
  // instead of the live round UI. Self-resolving: once the next round's
  // started_at moves past their joined_at, this naturally flips false.
  const myPlayer = players.find((p) => p.player_id === playerId);
  const joinedMidRound = Boolean(
    myPlayer?.joined_at &&
    currentRound?.started_at &&
    new Date(myPlayer.joined_at) > new Date(currentRound.started_at)
  );

  // Ensure anonymous auth is initialized for guests landing here from a shared link
  const initializeAuth = useGameStore((s) => s.initializeAuth);
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);


  // Kicked detection
  const wasInRoomRef = useRef(false);
  useEffect(() => {
    if (!playerId || loading) return;
    const me = players.find((p) => p.player_id === playerId);
    if (me) {
      wasInRoomRef.current = true;
    } else if (wasInRoomRef.current && room && !isHostPlayer) {
      toast.error("You were removed from the game by the host");
      navigate("/multiplayer");
    }
  }, [players, playerId, loading, room, isHostPlayer, navigate]);

  const handleLeaveGame = useCallback(async () => {
    if (audioRef.current) audioRef.current.pause();
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (terminationTimerRef.current) clearInterval(terminationTimerRef.current);
    await leaveRoom();
    navigate("/multiplayer");
  }, [leaveRoom, navigate]);

  // Reset activity timer
  const resetActivityTimer = useCallback(() => {
    setShowInactivityWarning(false);
    setTerminationCountdown(TERMINATION_COUNTDOWN);
    
    // Clear existing timers
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (terminationTimerRef.current) clearInterval(terminationTimerRef.current);
    
    // Only set inactivity timer during active game states
    if (gameStatus === "playing" || gameStatus === "between_rounds") {
      inactivityTimerRef.current = setTimeout(() => {
        setShowInactivityWarning(true);
        setTerminationCountdown(TERMINATION_COUNTDOWN);
        
        // Start termination countdown
        terminationTimerRef.current = setInterval(() => {
          setTerminationCountdown((prev) => {
            if (prev <= 1) {
              if (terminationTimerRef.current) clearInterval(terminationTimerRef.current);
              // Auto-leave the game
              handleLeaveGame();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, INACTIVITY_WARNING_TIME);
    }
  }, [gameStatus, handleLeaveGame]);

  // Track activity on user interactions
  useEffect(() => {
    const handleActivity = () => {
      if (!showInactivityWarning) {
        resetActivityTimer();
      }
    };

    // Listen for user activity
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [resetActivityTimer, showInactivityWarning]);

  // Initialize activity timer when game starts
  useEffect(() => {
    if (gameStatus === "playing" || gameStatus === "between_rounds") {
      resetActivityTimer();
    }
    
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (terminationTimerRef.current) clearInterval(terminationTimerRef.current);
    };
  }, [gameStatus, resetActivityTimer]);

  // Reset timer when player answers or round changes
  useEffect(() => {
    if (hasAnswered || currentRound?.id) {
      resetActivityTimer();
    }
  }, [hasAnswered, currentRound?.id, resetActivityTimer]);

  // Handle staying in game (dismiss warning)
  const handleStayInGame = () => {
    setShowInactivityWarning(false);
    if (terminationTimerRef.current) clearInterval(terminationTimerRef.current);
    resetActivityTimer();
  };

  // Warm the CDN connection as soon as we know the next preview URL,
  // even before we start preloading. Cheap and idempotent.
  useEffect(() => {
    if (currentRound?.preview_url) {
      warmAudioUrl(currentRound.preview_url);
    }
  }, [currentRound?.preview_url]);

  // Kept in sync with needsSoundUnlock state so the onWaiting listener
  // (attached once per track inside the audio-handling effect below, whose
  // own closure is stale by the time needsSoundUnlock changes later) can
  // read the current value instead of whatever it was when that effect ran.
  const needsSoundUnlockRef = useRef(false);
  useEffect(() => {
    needsSoundUnlockRef.current = needsSoundUnlock;
  }, [needsSoundUnlock]);

  // The chip is scoped to gameStatus === "playing"; leaving that state (a
  // new round's pre_game/between_rounds countdown, results, leaving the
  // room) always clears it so it can't linger into a state it doesn't apply
  // to. Round transitions themselves re-run the audio effect below, which
  // determines fresh whether the new round needs it too.
  useEffect(() => {
    if (gameStatus !== "playing") setNeedsSoundUnlock(false);
  }, [gameStatus, currentRound?.id]);

  // Audio handling — preload during between_rounds, play instantly when round starts
  useEffect(() => {
    let cancelled = false;

    const setupAudio = async () => {
      if (!currentRound?.preview_url) return;
      if (gameStatus !== "playing" && gameStatus !== "between_rounds" && gameStatus !== "pre_game") return;

      const desiredVolume = volume;
      const existing = audioRef.current;
      const sameTrack = existing && preloadedForUrlRef.current === currentRound.preview_url;

      if (!sameTrack) {
        setSlowConnection(false);
        if (existing) existing.pause();
        if (audioListenersRef.current) {
          audioListenersRef.current.audio.removeEventListener("waiting", audioListenersRef.current.onWaiting);
          audioListenersRef.current.audio.removeEventListener("playing", audioListenersRef.current.onPlaying);
          audioListenersRef.current = null;
        }
        warmAudioUrl(currentRound.preview_url);
        // Wait up to the actual time remaining before this round goes live
        // (typically the full ~5s between-rounds gap), not a flat 2.5s --
        // a connection that would've finished buffering at 4s previously
        // got cut off at 2.5s for no reason. Floored at 1.5s for the case
        // this fires after started_at already passed (a reload mid-round),
        // capped at 8s as a sane ceiling if something's off with the clock.
        const msUntilStart = new Date(currentRound.started_at).getTime() - Date.now();
        const timeoutMs = Math.min(8000, Math.max(1500, msUntilStart));
        const { audio, ready } = preloadAudio(currentRound.preview_url, {
          timeoutMs,
          volume: desiredVolume,
        });
        audio.onerror = (e) => {
          logError("audio.preload_failed", "Failed to preload multiplayer round audio", {
            roundNumber,
            roundId: currentRound?.id,
            preview_url: currentRound?.preview_url,
            error: String((e as ErrorEvent)?.message ?? "audio error"),
          });
        };
        // Keep watching for the whole round, not just the initial start --
        // a healthy connection can still run dry mid-clip (buffer
        // underrun), silently pausing with no sound until it rebuffers.
        // "waiting" fires whenever that happens; "playing" fires both on
        // first start and every time it resumes, so one handler covers both.
        const onWaiting = () => {
          // While an iOS unlock is pending, "waiting" is a side effect of
          // that (not a real buffer underrun) -- showing "Slow connection"
          // here would flash the wrong banner right before "Tap for sound"
          // settles. Once actually unlocked, waiting means what it always
          // has and the wifi banner is accurate again.
          if (!needsSoundUnlockRef.current) setSlowConnection(true);
          setIsPlaying(false);
        };
        const onPlaying = () => {
          setSlowConnection(false);
          setIsPlaying(true);
        };
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("playing", onPlaying);
        audioListenersRef.current = { audio, onWaiting, onPlaying };
        audioRef.current = audio;
        preloadedForUrlRef.current = currentRound.preview_url;
        const preloadResult = await ready;
        // "timeout" just means still loading past our budget -- streaming
        // can carry on via Range requests, so playback is still worth
        // attempting. "error" is the element itself reporting a real
        // failure (bad URL, CORS, etc.) -- not the same thing as "ready,"
        // so it's worth its own signal rather than silently proceeding as
        // if nothing happened.
        if (preloadResult === "error") {
          logWarn("audio.preload_error", "Multiplayer round audio element reported an error while preloading", {
            roundNumber,
            roundId: currentRound?.id,
            preview_url: currentRound?.preview_url,
          });
        }
      }

      if (cancelled) return;

      // Only start playback once the round is actually live
      if (gameStatus === "playing" && audioRef.current) {
        setSlowConnection(false);
        setNeedsSoundUnlock(false);
        const { stalled, error } = await playWithWatchdog(audioRef.current, desiredVolume);
        if (cancelled) return;
        if (!stalled) {
          setIsPlaying(true);
          console.log("Audio playing for round:", roundNumber);
        } else if (isIOS()) {
          // Autoplay outside a user gesture is routinely blocked (or
          // "succeeds" with no audible sound) on iOS Safari specifically --
          // this isn't a network problem, so the slow-connection banner
          // would be misleading. Show the tap-to-unlock chip instead; its
          // click handler reuses this same element with a gesture-backed
          // play() call.
          setIsPlaying(false);
          setNeedsSoundUnlock(true);
          logWarn("audio.ios_autoplay_blocked", "iOS autoplay blocked or silent, showing tap-to-unlock", {
            roundNumber,
            roundId: currentRound?.id,
            error: (error as Error)?.message ?? String(error),
          });
        } else {
          console.error("Error playing audio:", error);
          setIsPlaying(false);
          setSlowConnection(true);
          logError("audio.play_failed", "Failed to start multiplayer audio playback", {
            roundNumber,
            roundId: currentRound?.id,
            preview_url: currentRound?.preview_url,
            error: (error as Error)?.message ?? String(error),
          }, (error as Error)?.stack);
        }
      }
    };

    setupAudio();

    return () => {
      cancelled = true;
      // Don't pause during between_rounds — we want preloaded audio ready to play
      if (gameStatus !== "between_rounds" && gameStatus !== "pre_game" && audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [currentRound?.id, gameStatus]);

  // "Tap for sound" click handler -- the only reliable way to get audible
  // playback past iOS Safari's autoplay gate is a play() call made
  // synchronously inside the gesture that triggered it, on the exact
  // element that's already been preloaded (a fresh Audio() or reassigned
  // src would lose that buffering and restart from scratch).
  const handleUnlockSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = false;
    audio.volume = volume;
    audio.play().then(() => {
      setNeedsSoundUnlock(false);
      setIsPlaying(true);
    }).catch((error) => {
      logWarn("audio.unlock_tap_failed", "Tap-to-unlock play() failed", {
        roundNumber,
        roundId: currentRound?.id,
        error: (error as Error)?.message ?? String(error),
      });
    });
  }, [volume, roundNumber, currentRound?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Stop playing when answered -- pause the actual element, not just the
  // visualizer's isPlaying flag. Without this the clip kept buffering in
  // the background after answering, competing for bandwidth with the next
  // round's preload for no benefit (nothing is listening to it anymore).
  useEffect(() => {
    if (hasAnswered) {
      setIsPlaying(false);
      audioRef.current?.pause();
    }
  }, [hasAnswered]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const handleAnswer = (answer: string) => {
    if (!hasAnswered) {
      submitAnswer(answer);
      resetActivityTimer(); // Reset on answer
    }
  };
  // Fetch this player's per-round results for the share card once the game ends
  useEffect(() => {
    if (gameStatus !== "results" || !room?.id || !playerId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("player_answers")
        .select("is_correct, game_rounds(round_number)")
        .eq("room_id", room.id)
        .eq("player_id", playerId);
      if (data) {
        const ordered = [...data].sort(
          (a, b) => (a.game_rounds?.round_number ?? 0) - (b.game_rounds?.round_number ?? 0)
        );
        setMyResults(ordered.map((r) => !!r.is_correct));
      }

      const me = players.find((p) => p.player_id === playerId);
      trackEvent("multiplayer_game_complete", {
        room_code: room?.room_code,
        score: me?.score ?? 0,
        player_count: players.length,
      });

      // Points earned this game (awarded server-side by the room-finish
      // trigger): base score/100 + 5 per opponent outscored — computable from
      // the final standings; the running total comes from player_points.
      if (me) {
        const beaten = players.filter((p) => p.player_id !== playerId && p.score < me.score).length;
        const earned = Math.round(me.score / 100) + 5 * beaten;
        const { data: pointsRow } = await (supabase as any)
          .from("player_points")
          .select("points")
          .eq("player_id", playerId)
          .maybeSingle();
        setPointsResult({ earned, total: Number(pointsRow?.points ?? earned) });
      }

      // Snapshot the rounds as a challenge link (before Play Again deletes
      // them), so sharing can hand out a replay of the exact same songs.
      if (!challengeCodeRef.current) {
        const { data: rounds } = await (supabase as any)
          .from("game_rounds")
          .select("*")
          .eq("room_id", room.id)
          .order("round_number", { ascending: true });

        if (rounds && rounds.length > 0) {
          const plan = rounds.map((r: any) => ({
            track_id: String(r.track_id),
            track_name: r.track_name,
            artist_name: r.artist_name,
            preview_url: r.preview_url,
            artwork_url: r.artwork_url || "",
            question_type: (r.question_type === "song" ? "song" : "artist") as "song" | "artist",
            options: typeof r.options === "string" ? JSON.parse(r.options) : r.options ?? [],
          }));
          challengeCodeRef.current = await createChallenge({
            creator_name: me?.player_name || "A music fan",
            creator_score: me?.score || 0,
            category_name: PLAYLISTS.find((p) => p.id === room.category)?.name || "Music Quiz",
            time_per_round: room.time_per_round || 15,
            plan,
          });
          trackEvent("challenge_create", {
            challenge_code: challengeCodeRef.current,
            score: me?.score ?? 0,
            source: "multiplayer",
          });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStatus, room?.id, playerId]);

  // Redirect to lobby when room resets to waiting (Play Again)
  useEffect(() => {
    if (room?.status === "waiting") {
      navigate(`/room/${code}`);
    }
  }, [room?.status, code, navigate]);

  // Redirect home when host terminates the room
  useEffect(() => {
    if (isTerminated) {
      if (audioRef.current) audioRef.current.pause();
      toast.error("The host has left the game");
      navigate("/");
    }
  }, [isTerminated, navigate]);

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
    const currentPlayerRank = sortedPlayers.findIndex((p) => p.player_id === playerId) + 1;
    const myScore = players.find((p) => p.player_id === playerId)?.score || 0;
    const podiumPlayers = sortedPlayers.slice(0, 3);
    const restPlayers = sortedPlayers.slice(3);

    const handleShare = async () => {
      trackEvent("share_result", { mode: "multiplayer", score: myScore, rank: currentPlayerRank });
      const cardOpts = {
        categoryName: PLAYLISTS.find((p) => p.id === room.category)?.name || "Music Quiz",
        score: myScore,
        results: myResults,
        rank: currentPlayerRank || undefined,
        playerCount: players.length,
        challengeUrl: challengeCodeRef.current ? challengeUrl(challengeCodeRef.current) : undefined,
      };
      const text = buildShareText(cardOpts);

      const imageOutcome = await shareResultImage(cardOpts, text);
      if (imageOutcome === "shared" || imageOutcome === "canceled") return;
      if (imageOutcome === "downloaded" || imageOutcome === "downloaded_copy_failed") {
        toast.success(
          imageOutcome === "downloaded"
            ? "Image saved — result text copied too!"
            : "Image saved!"
        );
        return;
      }

      // Image path failed — fall back to text-only share
      const outcome = await shareResult(text);
      if (outcome === "copied") toast.success("Result copied — paste it anywhere!");
      if (outcome === "failed") toast.error("Couldn't share your result");
    };

    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <Starfield />
        <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-background/60 backdrop-blur-xl border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center">
                <img src={songiqLogo} alt="SongIQ — Music Trivia Game" className="h-8 md:h-10 w-auto" />
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5">
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">Leave</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave Room?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to leave?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Stay</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLeaveGame}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Leave
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground/70 hover:text-foreground"
              onClick={() => navigate("/")}
            >
              <UserCircle className="w-6 h-6" />
            </Button>
          </div>
        </header>
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)] pt-16 p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-8 max-w-xl w-full text-center z-10"
          >
            <h1 className="sr-only">Game Complete!</h1>
            <div className="relative flex flex-col items-center mb-6">
              <div className="relative flex items-end justify-center gap-1 mb-[-16px] z-10">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...CARD_SPRING, delay: 0.15 }}
                >
                  <Star className="w-9 h-9 text-gold drop-shadow-[0_0_8px_hsl(45_100%_60%/0.7)]" fill="currentColor" />
                </motion.div>
                <motion.div
                  initial={{ scale: 0, rotate: 10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={CARD_SPRING}
                >
                  <Trophy className="w-14 h-14 text-gold drop-shadow-[0_0_12px_hsl(45_100%_60%/0.8)]" fill="currentColor" />
                </motion.div>
                <motion.div
                  initial={{ scale: 0, rotate: 20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...CARD_SPRING, delay: 0.15 }}
                >
                  <Star className="w-9 h-9 text-gold drop-shadow-[0_0_8px_hsl(45_100%_60%/0.7)]" fill="currentColor" />
                </motion.div>
              </div>

              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...CARD_SPRING, delay: 0.25 }}
                className="relative rounded-2xl p-[2px]"
                style={{
                  background: "linear-gradient(90deg, #ffef00, #bf00ff)",
                  boxShadow: "0 0 30px rgba(255, 239, 0, 0.3)",
                }}
              >
                <div
                  className="relative rounded-2xl px-10 py-3"
                  style={{ background: "rgba(17, 20, 23, 0.8)", backdropFilter: "blur(24px)" }}
                >
                  <p
                    className="font-display italic font-black uppercase tracking-tighter text-2xl text-white"
                    style={{
                      textShadow:
                        "0 0 10px rgba(255, 239, 0, 0.8), 0 0 22px rgba(191, 0, 255, 0.6), 0 0 32px rgba(255, 239, 0, 0.35)",
                    }}
                  >
                    Game Complete!
                  </p>
                </div>
              </motion.div>
            </div>

            {podiumPlayers.length > 0 && (
              <div className="mb-6">
                <Podium players={podiumPlayers} currentPlayerId={playerId} verifiedIds={verifiedPlayerIds} />
              </div>
            )}

            <div className="bg-background/50 rounded-xl border border-gold/20 p-6 mb-6">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground/60 mb-1">Your Position</p>
              <p
                className="font-display text-5xl font-black text-gold mb-1"
                style={{ filter: "drop-shadow(0 0 16px hsl(var(--gold) / 0.5))" }}
              >
                #{currentPlayerRank}
              </p>
              <p className="text-foreground/60">{myScore} points</p>
              {myResults.length > 0 && (
                <p className="text-lg mt-3 tracking-wider" aria-hidden="true">
                  {myResults.map((r) => (r ? "🟩" : "🟥")).join("")}
                </p>
              )}
            </div>

            {pointsResult && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                onClick={() => navigate("/leaderboard")}
                className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/15 border border-gold/40 text-sm font-semibold text-gold"
              >
                🏅 +{pointsResult.earned} Points
                <span className="text-gold/70 font-normal">· {pointsResult.total} total</span>
              </motion.button>
            )}

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <Button variant="gold" size="lg" className="w-full sm:flex-1" onClick={handleShare}>
                <Share2 className="w-5 h-5 mr-2" />
                Share Result
              </Button>

              {isHostPlayer && (
                <Button variant="outline" size="lg" className="w-full sm:flex-1" onClick={async () => {
                  await playAgain();
                  navigate(`/room/${code}`);
                }}>
                  Play Again
                </Button>
              )}
            </div>

            {/* Remaining players (4th place and below) */}
            {restPlayers.length > 0 && (
              <Leaderboard players={restPlayers} currentPlayerId={playerId} compact rankOffset={3} hideHeader verifiedIds={verifiedPlayerIds} />
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // Pre-game countdown (before round 1) — gives everyone a moment to settle in
  if (gameStatus === "pre_game") {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <Starfield />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center justify-center z-10 text-center"
        >
          <div className="relative w-32 h-32 mb-8">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth="5" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - preGameCountdown / 5)}`}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold text-primary">{preGameCountdown}</span>
            </div>
          </div>

          <motion.h2
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-4xl font-bold text-gold mb-3"
          >
            Get Ready
          </motion.h2>
          <motion.p
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-foreground/80 font-semibold mb-2"
          >
            {nextQuestionType === "Guess the Artist" ? "🎤 Guess the Artist" : "🎵 Guess the Song"}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-foreground/60"
          >
            Round 1 starts in a moment…
          </motion.p>
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
          {/* Round Results + Up Next Overlay container */}
          <div className="flex-1 relative">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <h2 className="text-2xl font-bold text-foreground mb-4">Round {roundNumber} Complete!</h2>
              
              {currentRound && (
                <div className="game-card mb-6">
                  <img
                    src={currentRound.artwork_url || "/placeholder.svg"}
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
            </motion.div>

            {/* Up Next Overlay - scoped to main area only.
                 Render immediately (no fade-in) so the previous round's answer
                 card behind it never flashes when the round ends early. */}
            <AnimatePresence>
              {betweenRoundsCountdown > 0 && (
                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl"
                >
                  <div className="relative w-28 h-28 mb-6">
                    <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth="5" />
                      <circle
                        cx="50" cy="50" r="45" fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 45}`}
                        strokeDashoffset={`${2 * Math.PI * 45 * (1 - betweenRoundsCountdown / 5)}`}
                        className="transition-all duration-1000 ease-linear"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl font-bold text-primary">{betweenRoundsCountdown}</span>
                    </div>
                  </div>

                  <motion.h3
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-3xl font-bold text-gold mb-2"
                  >
                    {room && roundNumber >= room.total_rounds ? "Loading Results" : "Up Next"}
                  </motion.h3>
                  {room && roundNumber < room.total_rounds && (
                  <motion.p
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-xl text-foreground/80 font-semibold"
                  >
                    {nextQuestionType === "Guess the Artist" ? "🎤 Guess the Artist" : "🎵 Guess the Song"}
                  </motion.p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Leaderboard - always visible */}
          <div className="lg:w-96">
            <Leaderboard players={players} currentPlayerId={playerId} showRoundScore verifiedIds={verifiedPlayerIds} />
          </div>
        </div>

        {/* Inactivity Warning Modal */}
        <AnimatePresence>
          {showInactivityWarning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-card border border-destructive/50 rounded-2xl p-6 max-w-sm w-full text-center"
              >
                <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">Are you still there?</h3>
                <p className="text-muted-foreground mb-4">
                  You'll be removed from the game due to inactivity in
                </p>
                <div className="text-5xl font-bold text-destructive mb-6">{terminationCountdown}</div>
                <Button variant="gold" size="lg" className="w-full" onClick={handleStayInGame}>
                  I'm still here!
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Main game screen
  const isTimeLow = (timeLeft / ROUND_TIME) * 100 < 30;

  return (
    <div className="min-h-screen bg-background relative overflow-auto">
      <Helmet>
        <title>Multiplayer Music Quiz Room | SongIQ</title>
        <meta name="description" content="Live multiplayer music quiz room on SongIQ. Compete with friends in real time across Afrobeats, Pop and more." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href={`https://songiq.io/room/${code}/game`} />
        <meta property="og:title" content="Multiplayer Music Quiz Room | SongIQ" />
        <meta property="og:description" content="Join the live multiplayer music quiz on SongIQ." />
        <meta property="og:url" content={`https://songiq.io/room/${code}/game`} />
      </Helmet>
      <Starfield />
      <h1 className="sr-only">Multiplayer Music Quiz Gameplay</h1>

      <FloatingReactions reactions={reactions} />
      {/* Vertically centered on the right edge -- bottom-right is the
          FeedbackWidget's spot, and mobile's bottom leaderboard sheet spans
          the entire bottom edge during gameplay, so nothing near the bottom
          is safe here. */}
      <div className="fixed right-2 top-1/2 -translate-y-1/2 z-[80]">
        <ReactionBar onSend={sendReaction} orientation="vertical" />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 safe-area-inset-top">
            <div className="raised-panel px-4 py-3 md:px-6 md:py-4 max-w-[1000px] mx-auto">
            <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    aria-label="Leave game"
                    className="bg-destructive/90 hover:bg-destructive shadow-md w-9 h-9 shrink-0"
                  >
                    <X className="w-4 h-4" />
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
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground hidden sm:inline">Round</span>
                <span className="round-dot active w-7 h-7 text-sm shrink-0">{Math.max(roundNumber, 1)}</span>
                <span className="text-sm text-muted-foreground">/ {room.total_rounds}</span>
              </div>
              {isHostPlayer && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 shrink-0"
                    >
                      <Trophy className="w-4 h-4" />
                      <span className="hidden sm:inline">End Game</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>End the game now?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will immediately finish the game for everyone and show the final leaderboard.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Playing</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try { await endGameNow(); toast.success("Game ended"); }
                          catch { toast.error("Failed to end game"); }
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        End Game
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            <div className="hidden md:flex flex-col items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Time Remaining</span>
              <motion.span
                className={cn("text-2xl md:text-3xl font-black", isTimeLow ? "text-red-400" : "text-gold")}
                style={{
                  filter: isTimeLow
                    ? "drop-shadow(0 0 16px hsl(0 84% 60% / 0.6))"
                    : "drop-shadow(0 0 16px hsl(var(--gold) / 0.6))",
                }}
                animate={isTimeLow ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 0.5 }}
              >
                {Math.ceil(timeLeft / 1000)}s
              </motion.span>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Score</p>
                <p className="text-2xl md:text-3xl font-black text-foreground">
                  {players.find((p) => p.player_id === playerId)?.score || 0}
                </p>
              </div>
              <VolumeControl volume={volume} onVolumeChange={setVolume} />
            </div>
            </div>

            {/* Time remaining — mobile only, original label-left/value-right row */}
            <div className="flex md:hidden justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Time remaining</span>
              <motion.span
                className={cn("font-bold", isTimeLow ? "text-red-400" : "text-primary")}
                animate={isTimeLow ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 0.5 }}
              >
                {Math.ceil(timeLeft / 1000)}s
              </motion.span>
            </div>

            {/* Progress bar */}
            <div className="progress-track h-1.5">
              <motion.div
                className="progress-fill"
                initial={{ width: "100%" }}
                animate={{ width: `${(timeLeft / ROUND_TIME) * 100}%` }}
                transition={{ duration: 0.5 }}
                style={{
                  background: isTimeLow
                    ? "linear-gradient(90deg, hsl(0 70% 50%), hsl(0 70% 60%))"
                    : undefined,
                  boxShadow: isTimeLow ? undefined : "0 0 8px hsl(45 100% 60% / 0.5)",
                }}
              />
            </div>
            </div>
          </div>

          {/* Main game area */}
          <div className="flex-1 flex flex-col items-center justify-start px-4 py-8">
            {joinedMidRound ? (
              // Joined after this round already started -- nothing to
              // meaningfully answer here, so wait it out instead of dropping
              // them into a question they never saw the start of. Flips back
              // to the normal round UI automatically once the next round
              // (started after they joined) begins.
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center text-center gap-4 max-w-sm mt-12"
              >
                <div className="w-20 h-20 rounded-full bg-card border border-border flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Game in progress</h2>
                <p className="text-muted-foreground">
                  Round {roundNumber} is already underway. You'll jump in when the next round starts.
                </p>
              </motion.div>
            ) : (
            <>
            {/* Question type indicator */}
            <div
              className="mb-4 px-4 py-2 rounded-full bg-gold"
              style={{ boxShadow: "var(--shadow-glow), var(--shadow-inset-highlight)" }}
            >
              <p className="font-display text-xs font-extrabold text-background tracking-wide">
                {currentQuestionType === "Guess the Song" ? "🎵 GUESS THE SONG" : "🎤 GUESS THE ARTIST"}
              </p>
            </div>

            {/* Album art / Visualizer */}
            <motion.div
              key={roundNumber}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative mb-8"
            >
              {revealActive && currentRound ? (
                <div className="w-48 h-48 rounded-2xl overflow-hidden shadow-2xl">
                  <img
                    src={currentRound.artwork_url || "/placeholder.svg"}
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

            <AnimatePresence>
              {slowConnection && gameStatus === "playing" && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/15 border border-destructive/40 text-xs font-semibold text-destructive"
                >
                  <WifiOff className="w-3.5 h-3.5 shrink-0" />
                  Slow connection — audio may be delayed
                </motion.div>
              )}
            </AnimatePresence>

            {/* iOS-only autoplay fallback -- a real gesture is the only
                reliable way to unlock audible sound there. Never appears on
                Android/desktop, where autoplay already just works. */}
            <AnimatePresence>
              {needsSoundUnlock && gameStatus === "playing" && (
                <motion.button
                  type="button"
                  onClick={handleUnlockSound}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold/15 border border-gold/40 text-xs font-semibold text-gold hover:bg-gold/25 transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  Tap for sound
                </motion.button>
              )}
            </AnimatePresence>

            {/* Song info — held back until the round's reveal window */}
            <AnimatePresence>
              {revealActive && currentRound && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center mb-6"
                >
                  <h2 className="text-xl font-bold text-foreground">{currentRound.track_name}</h2>
                  <p className="text-foreground/60">{currentRound.artist_name}</p>
                  <div
                    className={`mt-2 text-lg font-bold ${
                      isCorrect === true ? "text-green-500" : hasAnswered ? "text-red-500" : "text-muted-foreground"
                    }`}
                  >
                    {isCorrect === true ? "Correct! 🎉" : hasAnswered ? "Wrong!" : "Time's up ⏰"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Answer options - 2x2 grid. Grading is deferred: nothing turns
                green/red until the round's reveal window, when everyone's
                picks also appear as avatars on the cards they chose. */}
            <div className="w-full max-w-2xl grid grid-cols-2 gap-4">
              {currentRound?.options.map((option, index) => {
                const correctAnswer = currentQuestionType === "Guess the Song" ? currentRound.track_name : currentRound.artist_name;
                const normalize = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
                const hasCorrectAnswer = Boolean(correctAnswer);
                const optionIsSelected = selectedAnswer === option;
                // Trust the backend grade for the selected option; otherwise compare normalized strings.
                const optionIsCorrect = optionIsSelected
                  ? isCorrect === true
                  : hasCorrectAnswer && normalize(option) === normalize(correctAnswer);
                const shouldRevealOption = revealActive && (hasCorrectAnswer || optionIsSelected);
                const pickers = revealActive ? roundAnswers[option] ?? [] : [];

                return (
                  <div key={`${roundNumber}-${index}`} className="relative">
                    <AnswerOption
                      option={option}
                      index={index}
                      isSelected={optionIsSelected}
                      isCorrect={optionIsCorrect}
                      isRevealed={shouldRevealOption}
                      disabled={hasAnswered}
                      onClick={() => handleAnswer(option)}
                    />
                    {pickers.length > 0 && (
                      <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex -space-x-1.5">
                        {pickers.map((pid, i) => {
                          const picker = players.find((p) => p.player_id === pid);
                          if (!picker) return null;
                          return (
                            <motion.div
                              key={pid}
                              initial={{ scale: 0, y: 6 }}
                              animate={{ scale: 1, y: 0 }}
                              transition={{ ...CARD_SPRING, delay: i * 0.06 }}
                            >
                              <PlayerAvatar
                                variant="icon-only"
                                size="2xs"
                                name={picker.player_name}
                                avatarIndex={picker.avatar_index}
                                playerId={pid}
                              />
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Waiting indicator after answering, until the reveal */}
            {hasAnswered && !revealActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-muted-foreground"
              >
                Answer locked in 🔒 Waiting for other players...
              </motion.div>
            )}
            </>
            )}
          </div>
        </div>

        {/* Sidebar Leaderboard - Desktop */}
        <div className="hidden lg:block w-96 p-4 border-l border-border bg-background/50 backdrop-blur-sm">
          <Leaderboard players={players} currentPlayerId={playerId} showRoundScore verifiedIds={verifiedPlayerIds} />
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
                  <PlayerAvatar
                    variant="icon-only"
                    size="xs"
                    name={player.player_name}
                    avatarIndex={player.avatar_index}
                    playerId={player.player_id}
                  />
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

      {/* Up Next overlay — fullscreen on the gameplay screen as well, so the
           moment the last player answers (betweenRoundsCountdown > 0) the
           overlay instantly covers the answer reveal underneath. Prevents the
           "previous answer flash" before transitioning to the between-rounds
           screen. */}
      {(betweenRoundsCountdown > 0 || isFinalizingResults) && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center z-40">
          {!isFinalizingResults && (
            <div className="relative w-28 h-28 mb-6">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth="5" />
                <circle
                  cx="50" cy="50" r="45" fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (1 - betweenRoundsCountdown / 5)}`}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl font-bold text-primary">{betweenRoundsCountdown}</span>
              </div>
            </div>
          )}
          <h3 className="text-3xl font-bold text-gold mb-2">
            {room && roundNumber >= room.total_rounds ? "Loading Results" : "Up Next"}
          </h3>
          {room && roundNumber < room.total_rounds && (
            <p className="text-xl text-foreground/80 font-semibold">
              {nextQuestionType === "Guess the Artist" ? "🎤 Guess the Artist" : "🎵 Guess the Song"}
            </p>
          )}
        </div>
      )}

      {/* Inactivity Warning Modal */}
      <AnimatePresence>
        {showInactivityWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card border border-destructive/50 rounded-2xl p-6 max-w-sm w-full text-center"
            >
              <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
              <h3 className="text-xl font-bold text-foreground mb-2">Are you still there?</h3>
              <p className="text-muted-foreground mb-4">
                You'll be removed from the game due to inactivity in
              </p>
              <div className="text-5xl font-bold text-destructive mb-6">{terminationCountdown}</div>
              <Button variant="gold" size="lg" className="w-full" onClick={handleStayInGame}>
                I'm still here!
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
