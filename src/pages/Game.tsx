import { useState, useEffect, useRef, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, Music2, X, Share2, Play, Star, Flame, ArrowLeft, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Starfield } from "@/components/Starfield";
import { RoundIndicator } from "@/components/RoundIndicator";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { AnswerOption } from "@/components/AnswerOption";
import { TimerBar } from "@/components/TimerBar";
import { Button } from "@/components/ui/button";
import { DailyReminderButton } from "@/components/DailyReminderButton";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { CARD_SPRING } from "@/lib/motion";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppleMusic, type AppleMusicTrack } from "@/hooks/useAppleMusic";
import { useGameStore } from "@/lib/gameStore";
import { PLAYLISTS, getPlaylistById } from "@/lib/playlists";
import { calculatePoints } from "@/lib/spotify";
import { logError, logWarn, logInfo } from "@/lib/clientLogger";
import { warmAudioUrl, preloadAudio, playWithWatchdog, prefetchAudio } from "@/lib/audioPreload";
import { buildShareText, shareResult } from "@/lib/shareCard";
import { shareResultImage } from "@/lib/shareImage";
import { trackEvent } from "@/lib/analytics";
import {
  createChallenge,
  challengeUrl,
  getSavedUsername,
  saveUsername,
  submitChallengeAttempt,
  fetchChallengeAttempts,
  fetchMyChallengeAttempt,
  type Challenge,
  type ChallengeRound,
  type ChallengeAttempt,
} from "@/lib/challenges";
import {
  submitDailyAttempt,
  fetchMyDailyRank,
  fetchMyDailyStats,
  fetchTodayChallenge,
  fetchMyDailyAttempt,
  fetchDailyAttempts,
  isStreakActive,
  buildDailyShareText,
} from "@/lib/daily";

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
  // Daily mode rides the same mechanism with an extra marker.
  const navState = location.state as { challenge?: Challenge; daily?: { date: string; number: number } } | null;
  const challenge = navState?.challenge ?? null;
  const daily = navState?.daily ?? null;
  const ROUND_TIME = (challenge ? challenge.time_per_round : DEFAULT_ROUND_TIME / 1000) * 1000;
  const TOTAL_ROUNDS = challenge ? challenge.plan.length : DEFAULT_TOTAL_ROUNDS;

  const { category: playlistId, playerName, playerId, avatarIndex, initializeAuth, setPlayer } = useGameStore();

  const { getPlaylistTracks, loading: loadingTracks, error: musicError } = useAppleMusic();
  const { soloScore, addSoloPoints, resetSoloGame } = useGameStore();

  const [gameState, setGameState] = useState<"loading" | "ready" | "playing" | "answered" | "countdown" | "results">("loading");
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
  const [slowConnection, setSlowConnection] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [countdown, setCountdown] = useState(COUNTDOWN_TIME);
  const [questionType, setQuestionType] = useState<QuestionType>("artist");
  const [nextQuestionType, setNextQuestionType] = useState<QuestionType>("song");
  const [roundResults, setRoundResults] = useState<boolean[]>([]);
  const [challengeAttempts, setChallengeAttempts] = useState<ChallengeAttempt[] | null>(null);
  const [dailyResult, setDailyResult] = useState<{ rank: number; total: number; streak: number } | null>(null);
  const [dailyPromo, setDailyPromo] = useState<{ number: number; categoryName: string; totalPlayed: number } | null>(null);
  // Separate from the Apple Music hook's `error` (which only covers thrown
  // fetch exceptions) — this also covers a *successful* fetch that simply
  // came back with fewer tracks than a round needs.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Solo Play never collects a name up front — prompt for one only when
  // they try to share, so the result/challenge isn't attributed to
  // "A music fan".
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Rounds captured as played, so a normal game can be shared as a challenge
  const planRef = useRef<ChallengeRound[]>([]);
  const createdChallengeRef = useRef<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedForUrlRef = useRef<string | null>(null);
  // Clips already downloaded into the browser's HTTP cache
  const prefetchedUrlsRef = useRef<Set<string>>(new Set());
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
  }, []);

  // Get playlist info
  const playlist = getPlaylistById(playlistId) || PLAYLISTS[0];

  // Fully download round 1's clip (bounded wait) while the loading screen is
  // up, then show the tap-to-play screen. The player's tap is the user
  // gesture browsers require for audio, so playback starts instantly AND
  // reliably on every device.
  const ensureFirstClip = async (track: AppleMusicTrack | undefined) => {
    if (!track?.previewUrl) return;
    if (!prefetchedUrlsRef.current.has(track.previewUrl)) {
      const download = prefetchAudio(track.previewUrl).then((ok) => {
        if (ok) prefetchedUrlsRef.current.add(track.previewUrl);
        return ok;
      });
      await Promise.race([
        download,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
    }
    // Priming an actual <audio> element (not just warming the HTTP cache)
    // matters here: without this, tapping "Tap to Play" constructed a brand
    // new element from scratch and had to wait through load→canplay before
    // sound started — a ~1s gap even with the file already cached. Rounds
    // 2+ never had this gap because the countdown screen already does this
    // same priming; round 1 just skipped it since there's no countdown before it.
    const { audio, ready } = preloadAudio(track.previewUrl, {
      timeoutMs: 2500,
      volume: isMuted ? 0 : 0.7,
    });
    await ready;
    preloadedAudioRef.current = audio;
    preloadedForUrlRef.current = track.previewUrl;
  };

  // Load tracks on mount
  useEffect(() => {
    (async () => {
      // A remount with challenge/daily nav state still present (e.g. a
      // mobile tab reload after the OS share sheet backgrounds the page —
      // history.state survives that) must not replay an already-completed
      // single-attempt game. Check for an existing attempt first.
      const pid = challenge || daily ? playerId ?? (await initializeAuth()) : null;
      if (challenge && pid) {
        const attempt = await fetchMyChallengeAttempt(challenge.code, pid);
        if (attempt) {
          navigate(`/c/${challenge.code}`, { replace: true });
          return;
        }
      } else if (daily && pid) {
        const attempt = await fetchMyDailyAttempt(daily.date, pid);
        if (attempt) {
          navigate("/daily", { replace: true });
          return;
        }
      }
      resetSoloGame();
      loadTracks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      warmAudioUrl(planTracks[1]?.previewUrl);
      await ensureFirstClip(planTracks[0]);
      setGameState("ready");
      return;
    }

    if (!playlist) {
      console.error("No playlist found");
      return;
    }

    console.log("Loading tracks for playlist:", playlist.name);
    setLoadError(null);
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
      // Warm round 2 so the background queue's first download is instant.
      warmAudioUrl(shuffledTracks[1]?.previewUrl);
      // Fully download round 1, then wait for the player's tap.
      await ensureFirstClip(shuffledTracks[0]);
      setGameState("ready");
    } else {
      console.error("Not enough tracks loaded:", result?.tracks.length || 0);
      logError("solo.tracks_load_failed", "Solo game failed to load enough tracks", {
        playlistId: playlist.id,
        playlistName: playlist.name,
        loaded: result?.tracks.length ?? 0,
        required: TOTAL_ROUNDS,
        musicError,
      });
      // Without this, gameState (and the screen) is left exactly as it was
      // before this call — e.g. still showing the previous game's results
      // screen after Play Again, looking like the click did nothing.
      setGameState("loading");
      setLoadError("Couldn't load enough songs for this playlist. Please try again.");
    }
  };

  const startRound = (availableTracks: AppleMusicTrack[], round: number) => {
    // Use the pre-shuffled track for this round (no re-shuffling to avoid repeats)
    const track = availableTracks[round - 1];
    
    if (!track) {
      setGameState("results");
      return;
    }

    // An artist-spotlight playlist is only ever "Guess the Song" — features/
    // collabs can make the pool's artist names look diverse enough for
    // "Guess the Artist" to technically work, but that defeats the point of
    // an artist playlist. Any other playlist still needs the diversity check
    // as a safety net against unexpectedly narrow pools.
    const canGuessArtist =
      !playlist.isArtist && new Set(availableTracks.map((t) => t.artistName)).size >= 4;
    const pickQuestionType = (): QuestionType =>
      canGuessArtist && Math.random() > 0.5 ? "artist" : "song";

    // Question type and options come from the challenge plan when replaying;
    // otherwise they're generated fresh
    const planRound = challenge?.plan[round - 1];
    const roundQuestionType: QuestionType =
      planRound?.question_type ?? pickQuestionType();
    setQuestionType(roundQuestionType);

    // Pre-determine next round's question type for the hint
    const nextRoundQuestionType: QuestionType =
      challenge?.plan[round]?.question_type ?? pickQuestionType();
    setNextQuestionType(nextRoundQuestionType);

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
    // Without this, a failed refetch leaves gameState (and the screen)
    // exactly as it was — still showing the just-finished results, making
    // the click look like it did nothing.
    setGameState("loading");
    resetSoloGame();
    setCurrentRound(1);
    loadTracks();
  };

  // Pre-create the challenge link when results appear, so tapping Share stays
  // within the browser's user-gesture window (navigator.share requires it).
  // Skipped when there's no known name yet (a Solo Play game started without
  // one) — doShare() creates it lazily once the name prompt resolves, rather
  // than baking in "A music fan" here, since challenges are immutable once
  // created (no updating creator_name after the fact).
  useEffect(() => {
    if (gameState !== "results") return;
    if (challenge || createdChallengeRef.current || planRef.current.length === 0) return;
    const knownName = playerName || getSavedUsername();
    if (!knownName) return;
    createChallenge({
      creator_name: knownName,
      creator_score: soloScore,
      category_name: playlistName || playlist?.name || "Music Quiz",
      time_per_round: ROUND_TIME / 1000,
      plan: planRef.current,
    }).then((code) => {
      createdChallengeRef.current = code;
      trackEvent("challenge_create", { challenge_code: code, score: soloScore, source: "solo" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Regular solo game finished (no challenge, no daily).
  useEffect(() => {
    if (gameState !== "results" || challenge || daily) return;
    trackEvent("solo_game_complete", {
      playlist_id: playlist?.id,
      playlist_name: playlistName || playlist?.name,
      score: soloScore,
      correct_count: roundResults.filter(Boolean).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Challenge replay finished: record this player's (single) attempt, then
  // load the leaderboard. The DB unique constraint makes retries no-ops.
  useEffect(() => {
    if (gameState !== "results" || !challenge || daily) return;
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
        trackEvent("challenge_complete", {
          challenge_code: challenge.code,
          score: soloScore,
          correct_count: roundResults.filter(Boolean).length,
        });
      }
      setChallengeAttempts(await fetchChallengeAttempts(challenge.code));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Daily challenge finished: record the attempt (streak trigger runs
  // server-side), then load rank and streak for the results screen.
  useEffect(() => {
    if (gameState !== "results" || !daily) return;
    (async () => {
      const pid = playerId ?? (await initializeAuth());
      if (pid) {
        await submitDailyAttempt(
          daily.date,
          pid,
          playerName || getSavedUsername() || "A music fan",
          soloScore,
          roundResults.filter(Boolean).length
        );
        const [{ rank, total }, stats] = await Promise.all([
          fetchMyDailyRank(daily.date, soloScore),
          fetchMyDailyStats(pid),
        ]);
        const streak = isStreakActive(stats) ? stats?.current_streak ?? 0 : 0;
        setDailyResult({ rank, total, streak });
        trackEvent("daily_challenge_complete", {
          daily_number: daily.number,
          daily_date: daily.date,
          score: soloScore,
          correct_count: roundResults.filter(Boolean).length,
          rank,
          streak,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Regular (non-daily) game finished: if today's Daily Challenge exists and
  // this player hasn't attempted it yet, surface a conversion-focused prompt
  // on the results screen.
  useEffect(() => {
    if (gameState !== "results" || daily) return;
    (async () => {
      try {
        const todayChallenge = await fetchTodayChallenge();
        if (!todayChallenge) return;
        const pid = playerId ?? (await initializeAuth());
        if (!pid) return;
        const mine = await fetchMyDailyAttempt(todayChallenge.challenge_date, pid);
        if (mine) return; // already played today's daily challenge
        const { total } = await fetchDailyAttempts(todayChallenge.challenge_date);
        setDailyPromo({ number: todayChallenge.number, categoryName: todayChallenge.category_name, totalPlayed: total });
      } catch {
        // results screen works fine without the daily-challenge promo
      }
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
      // Give round 1's stream a head start before using bandwidth
      await new Promise((r) => setTimeout(r, 3000));
      if (bgPreloadCancelRef.current) return;
      // Round 1 streams normally; queue rounds 2..N into the HTTP cache.
      // Bounded per track (matches ensureFirstClip's own timeout) -- on a
      // very slow connection, one pathologically slow download shouldn't
      // block every later round from getting its own head start.
      for (const track of tracks.slice(1, TOTAL_ROUNDS)) {
        if (bgPreloadCancelRef.current) return;
        if (!track.previewUrl || prefetchedUrlsRef.current.has(track.previewUrl)) continue;
        const ok = await Promise.race([
          prefetchAudio(track.previewUrl),
          new Promise<false>((resolve) => setTimeout(() => resolve(false), 8000)),
        ]);
        if (ok) prefetchedUrlsRef.current.add(track.previewUrl);
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

    // The clip is usually already in the HTTP cache from the background
    // queue, so this element buffers instantly from disk.
    warmAudioUrl(nextTrack.previewUrl);
    const { audio } = preloadAudio(nextTrack.previewUrl, {
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

    setSlowConnection(false);

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
        // Served from the browser's HTTP cache when prefetched, else streams
        audio = new Audio(currentTrack.previewUrl);
        audio.preload = "auto";
        audio.volume = desiredVolume;
      }
      audioRef.current = audio;
      playWithWatchdog(audio, desiredVolume).then(({ stalled, error }) => {
        if (!stalled) return;
        setSlowConnection(true);
        console.error(error);
        logError("solo.audio_play_failed", "Solo audio playback failed", {
          round: currentRound,
          trackId: currentTrack.trackId,
          trackName: currentTrack.trackName,
          previewUrl: currentTrack.previewUrl,
          error: (error as Error)?.message ?? String(error),
        }, (error as Error)?.stack);
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
    const loadFailure = loadError || musicError;
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <Starfield />
        <div className="text-center z-10 max-w-sm w-full">
          {loadFailure ? (
            <>
              <Music2 className="w-16 h-16 text-gold mx-auto mb-4" />
              <p className="text-xl text-foreground/80 mb-2">Couldn't load {playlist?.name || "tracks"}</p>
              <p className="text-red-400 mb-6">{loadFailure}</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => navigate("/solo")}>
                  Categories
                </Button>
                <Button variant="gold" className="flex-1" onClick={handlePlayAgain}>
                  Try Again
                </Button>
              </div>
            </>
          ) : (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 mx-auto mb-4"
              >
                <Music2 className="w-full h-full text-gold" />
              </motion.div>
              <p className="text-xl text-foreground/80">Loading {playlist?.name || "tracks"}...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Ready screen: round 1's clip is downloaded; the tap doubles as the
  // user gesture browsers require before audio may play.
  if (gameState === "ready") {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <Starfield />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="raised-panel p-8 max-w-md w-full text-center z-10"
        >
          <Music2 className="w-16 h-16 text-gold mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {playlistName || playlist?.name || "Music Quiz"}
          </h1>
          <p className="text-muted-foreground mb-6">
            {TOTAL_ROUNDS} songs · {ROUND_TIME / 1000}s each
          </p>
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            onClick={() => startRound(tracks, 1)}
          >
            <Play className="w-5 h-5 mr-2" />
            Tap to Play
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full mt-2"
            onClick={() => {
              cleanupGame();
              navigate(challenge && !daily ? `/c/${challenge.code}` : daily ? "/daily" : "/solo");
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </motion.div>
      </div>
    );
  }

  if (gameState === "results") {
    const maxScore = TOTAL_ROUNDS * 200;
    const percentage = Math.round((soloScore / maxScore) * 100);

    const doShare = async () => {
      trackEvent("share_result", {
        mode: daily ? "daily" : challenge ? "challenge" : "solo",
        score: soloScore,
      });

      // The auto-create effect skips creating a challenge link when no name
      // is known yet — create it now that handleShare has guaranteed one.
      if (!challenge && !createdChallengeRef.current && planRef.current.length > 0) {
        const knownName = playerName || getSavedUsername();
        if (knownName) {
          const code = await createChallenge({
            creator_name: knownName,
            creator_score: soloScore,
            category_name: playlistName || playlist?.name || "Music Quiz",
            time_per_round: ROUND_TIME / 1000,
            plan: planRef.current,
          });
          createdChallengeRef.current = code;
          trackEvent("challenge_create", { challenge_code: code, score: soloScore, source: "solo" });
        }
      }

      if (daily) {
        const text = buildDailyShareText({
          number: daily.number,
          categoryName: playlistName || "Music Quiz",
          score: soloScore,
          results: roundResults,
          streak: dailyResult?.streak,
        });
        const imageOutcome = await shareResultImage(
          { categoryName: `Daily #${daily.number} — ${playlistName}`, score: soloScore, results: roundResults },
          text
        );
        if (imageOutcome === "shared" || imageOutcome === "canceled") return;
        if (imageOutcome === "downloaded" || imageOutcome === "downloaded_copy_failed") {
          toast.success(
            imageOutcome === "downloaded"
              ? "Image saved — result text copied too!"
              : "Image saved!"
          );
          return;
        }
        const outcome = await shareResult(text);
        if (outcome === "copied") toast.success("Result copied — paste it anywhere!");
        if (outcome === "failed") toast.error("Couldn't share your result");
        return;
      }

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

    const handleShare = () => {
      if ((playerName || getSavedUsername()).trim()) {
        doShare();
      } else {
        setNameInput("");
        setShowNamePrompt(true);
      }
    };

    const handleNameSubmit = () => {
      const trimmed = nameInput.trim();
      if (!trimmed) return;
      saveUsername(trimmed);
      setPlayer(trimmed, avatarIndex);
      setShowNamePrompt(false);
      doShare();
    };

    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <Starfield />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="raised-panel p-8 max-w-md w-full text-center z-10"
        >
          <h1 className="sr-only">Game Complete!</h1>
          <div className="relative flex flex-col items-center mb-4">
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
                <Star className="w-14 h-14 text-gold drop-shadow-[0_0_12px_hsl(45_100%_60%/0.8)]" fill="currentColor" />
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
              className="relative px-10 py-3 rounded-2xl border-2"
              style={{
                background: "linear-gradient(180deg, hsl(150 65% 48%), hsl(150 65% 36%))",
                borderColor: "hsl(150 70% 60% / 0.8)",
                boxShadow: "0 4px 0 hsl(150 70% 24%), 0 0 30px hsl(150 60% 45% / 0.5), var(--shadow-inset-highlight)",
              }}
            >
              <span className="pulse-kente absolute inset-0 rounded-2xl" />
              <p
                className="relative text-2xl font-bold text-white"
                style={{ textShadow: "0 2px 3px hsl(150 70% 15% / 0.6)" }}
              >
                Game Complete!
              </p>
            </motion.div>
          </div>

          <p className="text-foreground/60 mb-4">{playlistName}</p>

          <div className="flex items-center justify-center gap-2 mb-4">
            <PlayerAvatar
              variant="icon-only"
              size="sm"
              name={playerName || getSavedUsername() || "You"}
              avatarIndex={avatarIndex}
              playerId={playerId ?? undefined}
            />
            <p className="font-bold text-foreground">{playerName || getSavedUsername() || "You"}</p>
          </div>

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

          {daily && (
            <div className="bg-background/50 rounded-xl p-4 mb-6">
              <p className="text-muted-foreground mb-2">Daily Challenge #{daily.number}</p>
              {dailyResult ? (
                <>
                  <p className="text-2xl font-bold text-primary mb-1">
                    #{dailyResult.rank} <span className="text-base font-normal text-foreground/70">of {dailyResult.total} today</span>
                  </p>
                  {dailyResult.streak > 0 && (
                    <p className="font-semibold text-gold">🔥 {dailyResult.streak}-day streak</p>
                  )}
                  <p className="text-muted-foreground text-xs mt-2">Come back tomorrow to keep it alive!</p>
                  <DailyReminderButton className="mt-3" />
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Saving your result…</p>
              )}
            </div>
          )}

          {challenge && !daily && (
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
                    playerId: challenge.creator_id ?? null,
                    score: challenge.creator_score,
                    isMe: false,
                    isCreator: true,
                  },
                  ...(challengeAttempts ?? []).map((a) => ({
                    name: a.player_name,
                    playerId: a.player_id as string | null,
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
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {board.map((e, i) => (
                        <div
                          key={`${e.name}-${i}`}
                          className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${
                            e.isMe ? "bg-primary/15 border border-primary/40" : "bg-card/50"
                          }`}
                        >
                          <span className="font-semibold text-foreground flex items-center gap-2 min-w-0">
                            <PlayerAvatar variant="icon-only" size="xs" name={e.name} avatarIndex={1} playerId={e.playerId ?? undefined} />
                            <span className="truncate">
                              #{i + 1} {e.name} {e.isCreator && "👑"} {e.isMe && <span className="text-primary text-xs">(you)</span>}
                            </span>
                          </span>
                          <span className="font-bold text-gold shrink-0">{e.score}</span>
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

          {daily ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/daily")}
            >
              See Daily Leaderboard
            </Button>
          ) : challenge ? (
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

          {!daily && dailyPromo && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={CARD_SPRING}
              className="relative rounded-2xl border-2 p-5 mt-6 text-center overflow-hidden"
              style={{
                borderColor: "hsl(var(--kente-green) / 0.6)",
                background: "linear-gradient(160deg, hsl(150 60% 40% / 0.18), hsl(150 65% 30% / 0.1))",
                boxShadow: "0 4px 20px hsl(150 60% 40% / 0.3), var(--shadow-inset-highlight)",
              }}
            >
              <span className="pulse-kente absolute inset-0 rounded-2xl" />
              <p className="relative font-display text-lg text-kente-green mb-1">
                🔥 Daily Challenge #{dailyPromo.number}
              </p>
              <p className="relative text-sm text-muted-foreground mb-4">
                {dailyPromo.categoryName} ·{" "}
                {dailyPromo.totalPlayed > 0
                  ? `${dailyPromo.totalPlayed} played today`
                  : "be the first to play today"}
              </p>
              <Button
                variant="kente"
                size="lg"
                className="relative w-full whitespace-normal text-center leading-tight px-4 tracking-normal text-sm sm:text-base sm:tracking-wider"
                onClick={() => navigate("/daily")}
              >
                <Flame className="w-5 h-5 mr-2 shrink-0" />
                Play Today's Challenge
              </Button>
            </motion.div>
          )}
        </motion.div>

        <Dialog open={showNamePrompt} onOpenChange={setShowNamePrompt}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>What's your name?</DialogTitle>
              <DialogDescription>
                So your shared result isn't just "A music fan."
              </DialogDescription>
            </DialogHeader>
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Your nickname"
              aria-label="Your nickname"
              maxLength={20}
              className="text-center text-lg"
              onKeyDown={(e) => e.key === "Enter" && nameInput.trim() && handleNameSubmit()}
              autoFocus
            />
            <Button
              variant="gold"
              size="lg"
              className="w-full"
              onClick={handleNameSubmit}
              disabled={!nameInput.trim()}
            >
              <Share2 className="w-5 h-5 mr-2" />
              Share Result
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>Solo Music Quiz — Play Now | SongIQ</title>
        <meta name="description" content="Solo music quiz round in progress on SongIQ. Listen to 15-second clips and guess the song or artist." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href="https://songiq.io/solo/game" />
        <meta property="og:title" content="Solo Music Quiz — Play Now | SongIQ" />
        <meta property="og:description" content="Live solo round on SongIQ — guess the song or artist in 15 seconds." />
        <meta property="og:url" content="https://songiq.io/solo/game" />
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
                <AlertDialogTitle>
                  {challenge && !daily ? "Leave Challenge?" : daily ? "Leave Daily Challenge?" : "Leave Game?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {challenge && !daily
                    ? `This ends the challenge — your current score (${soloScore} pts) will be recorded as your final score. You won't be able to play this challenge again.`
                    : daily
                    ? `This ends today's challenge — your current score (${soloScore} pts) will be recorded as your final score. You won't be able to play today's challenge again.`
                    : "Are you sure you want to quit? Your current progress will be lost."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Playing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (challenge && !daily) {
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
                      trackEvent("challenge_complete", {
                        challenge_code: challenge.code,
                        score: soloScore,
                        correct_count: roundResults.filter(Boolean).length,
                        source: "left_early",
                      });
                    } else if (daily) {
                      const pid = playerId ?? (await initializeAuth());
                      if (pid) {
                        await submitDailyAttempt(
                          daily.date,
                          pid,
                          playerName || getSavedUsername() || "A music fan",
                          soloScore,
                          roundResults.filter(Boolean).length
                        );
                      }
                      trackEvent("daily_challenge_complete", {
                        daily_number: daily.number,
                        daily_date: daily.date,
                        score: soloScore,
                        correct_count: roundResults.filter(Boolean).length,
                        source: "left_early",
                      });
                    }
                    cleanupGame();
                    resetSoloGame();
                    navigate(challenge && !daily ? `/c/${challenge.code}` : daily ? "/daily" : "/solo");
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {challenge && !daily ? "Leave Challenge" : daily ? "Leave Daily" : "Leave Game"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <RoundIndicator currentRound={currentRound} totalRounds={TOTAL_ROUNDS} />
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-foreground/60">Score</p>
            <motion.p
              key={soloScore}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              transition={CARD_SPRING}
              className="text-xl font-bold text-gold"
            >
              {soloScore}
            </motion.p>
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
          transition={CARD_SPRING}
          className="mb-6 px-6 py-3 rounded-xl bg-gold shadow-lg shadow-gold/30"
          style={{ boxShadow: "var(--shadow-inset-highlight)" }}
        >
          <p className="text-lg font-bold text-background tracking-wide">
            {questionType === "artist" ? "🎤 GUESS THE ARTIST" : "🎵 GUESS THE SONG"}
          </p>
        </motion.div>

        {/* Album art / Visualizer */}
        <div className="relative mb-8 w-48 h-48">
          <AnimatePresence mode="wait">
            {gameState === "answered" && currentTrack ? (
              <motion.div
                key="artwork"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={CARD_SPRING}
                className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl"
              >
                <img
                  src={currentTrack.artworkUrl100.replace('100x100', '600x600')}
                  alt={currentTrack.collectionName}
                  className="w-full h-full object-cover"
                />
              </motion.div>
            ) : (
              <motion.div
                key="visualizer"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={CARD_SPRING}
                className="absolute inset-0 rounded-2xl bg-card flex items-center justify-center shadow-2xl border-2 border-border"
                style={{ boxShadow: "var(--shadow-card), var(--shadow-inset-highlight)" }}
              >
                <AudioVisualizer isPlaying={isPlaying} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {slowConnection && gameState === "playing" && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-muted-foreground"
            >
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              Slow connection — audio may be delayed
            </motion.div>
          )}
        </AnimatePresence>

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
                      className={isCorrect ? "text-kente-green" : "text-kente-red"}
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
