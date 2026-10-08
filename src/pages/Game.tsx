import { useState, useEffect, useRef, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Music2, X, Share2, Play, Star, Flame, ArrowLeft, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Starfield } from "@/components/Starfield";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { AnswerOption } from "@/components/AnswerOption";
import { Button } from "@/components/ui/button";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { DailyReminderButton } from "@/components/DailyReminderButton";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SaveProgressPrompt } from "@/components/SaveProgressPrompt";
import { VolumeControl } from "@/components/VolumeControl";
import { useConnectionQuality } from "@/hooks/useConnectionQuality";
import { useVolume } from "@/hooks/useVolume";
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
import { Input } from "@/components/ui/input";
import { useAppleMusic, type AppleMusicTrack } from "@/hooks/useAppleMusic";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { PLAYLISTS, getPlaylistById } from "@/lib/playlists";
import { calculatePoints } from "@/lib/spotify";
import { logError, logWarn, logInfo } from "@/lib/clientLogger";
import { vibrateRoundStart, vibrateCorrect, vibrateIncorrect } from "@/lib/haptics";
import { warmAudioUrl, preloadAudio, playWithWatchdog, prefetchAudio } from "@/lib/audioPreload";
import { buildShareText, buildStreakRepairShareText, shareResult, isIOSDevice } from "@/lib/shareCard";
import { StreakSaveModal, type StreakSaveEvent } from "@/components/StreakSaveModal";
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
  recordChallengeRound,
  finishChallengeAttempt,
  challengeProgressKey,
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
  fetchStreakProtectionStatus,
  isStreakActive,
  buildDailyShareText,
  recordDailyRound,
  finishDailyAttempt,
  dailyProgressKey,
} from "@/lib/daily";
import {
  enqueueRound,
  flushRounds,
  clearPendingRounds,
  isPlayActive,
  type RoundSender,
  type RoundResult,
  type SendOutcome,
} from "@/lib/roundProgress";
import { submitEventAttempt } from "@/lib/events";

const DEFAULT_ROUND_TIME = 15000; // 15 seconds per round
const DEFAULT_TOTAL_ROUNDS = 10;
const COUNTDOWN_TIME = 3; // 3 seconds countdown between rounds
// Deeper draw pool for event plays only, so replaying the same event repeats
// fewer songs across attempts -- normal Solo/Daily/Challenge pool depth (50)
// is untouched.
const EVENT_POOL_SIZE = 300;

type QuestionType = "artist" | "song";

// Two different tracks can carry near-identical title/artist strings --
// live/remix/edit versions of the same song, or "Artist & Featured Guest"
// joint credits -- that read as byte-different but look like the same
// answer twice to a player. These normalize both to the same key so the
// dedup below actually catches them. Mirrored server-side in
// supabase/functions/_shared/itunes.ts's buildRoundPlanFromPool -- keep
// both in sync.
function normalizeTitleForDedup(title: string): string {
  return title
    .replace(
      /\s*[([][^)\]]*\b(?:live|remix|mix|mixed|edit|acoustic|version|reissue|remaster(?:ed)?|rmx|vip|dub|dubb|extended|instrumental)\b[^)\]]*[)\]]/gi,
      ""
    )
    .replace(
      /\s*[-–—]\s*(?:live|remix|mix|mixed|edit|acoustic|version|reissue|remaster(?:ed)?|rmx|vip|dub|dubb|extended|instrumental|single|ep)\s*$/i,
      ""
    )
    .trim()
    .toLowerCase();
}

function normalizeArtistForDedup(name: string): string {
  return name
    .split(/,| & | feat\.?\s+| featuring\s+/i)[0]
    .trim()
    .toLowerCase();
}

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
  const normalize = questionType === "artist" ? normalizeArtistForDedup : normalizeTitleForDedup;

  // Get unique options from other tracks, deduped on the normalized key so
  // near-duplicates (see above) never both end up as visible choices.
  const seen = new Set([normalize(correctAnswer)]);
  const otherOptions: string[] = [];
  for (const t of [...allTracks].sort(() => Math.random() - 0.5)) {
    if (t.trackId === correctTrack.trackId) continue;
    const option = questionType === "artist" ? t.artistName : t.trackName;
    const key = normalize(option);
    if (seen.has(key)) continue;
    seen.add(key);
    otherOptions.push(option);
    if (otherOptions.length >= optionCount - 1) break;
  }

  return [correctAnswer, ...otherOptions].sort(() => Math.random() - 0.5);
}

export default function Game() {
  const navigate = useNavigate();
  const location = useLocation();

  // Challenge replay: /c/:code navigates here with the original game's plan,
  // so this game uses those exact tracks, question types and options.
  // Daily mode rides the same mechanism with an extra marker.
  const navState = location.state as {
    challenge?: Challenge;
    daily?: { date: string; number: number };
    event?: { slug: string; endsAt: string };
  } | null;
  const challenge = navState?.challenge ?? null;
  const daily = navState?.daily ?? null;
  const event = navState?.event ?? null;
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
  const [volume, setVolume] = useVolume();
  const [isPlaying, setIsPlaying] = useState(false);
  const [slowConnection, setSlowConnection] = useState(false);
  const [playlistName, setPlaylistName] = useState("");

  const isInGame = gameState === "playing" || gameState === "answered" || gameState === "countdown";
  const connectionQuality = useConnectionQuality(isInGame, currentTrack?.previewUrl);
  const [countdown, setCountdown] = useState(COUNTDOWN_TIME);
  const [questionType, setQuestionType] = useState<QuestionType>("artist");
  const [nextQuestionType, setNextQuestionType] = useState<QuestionType>("song");
  const [roundResults, setRoundResults] = useState<boolean[]>([]);
  const [challengeAttempts, setChallengeAttempts] = useState<ChallengeAttempt[] | null>(null);
  const [dailyResult, setDailyResult] = useState<{ rank: number; total: number; streak: number } | null>(null);
  const [streakSaveEvent, setStreakSaveEvent] = useState<StreakSaveEvent | null>(null);
  const [pointsResult, setPointsResult] = useState<{ earned: number; total: number } | null>(null);
  const [dailyPromo, setDailyPromo] = useState<{ number: number; categoryName: string; totalPlayed: number } | null>(null);
  // Separate from the Apple Music hook's `error` (which only covers thrown
  // fetch exceptions) — this also covers a *successful* fetch that simply
  // came back with fewer tracks than a round needs.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Solo Play never collects a name up front -- the results screen asks for
  // one inline, above Share, so a shared challenge isn't "A music fan".
  const [nameInput, setNameInput] = useState("");
  // True while the challenge link is being created -- Share waits on it
  // so the tap that opens the share sheet never has a network wait in front.
  const [linkPending, setLinkPending] = useState(false);
  // Guards doShare() against a double-tap creating two challenge rows for
  // one game -- createdChallengeRef is only set after createChallenge()
  // resolves, so a second tap before that finishes would otherwise pass
  // the ref check too.
  const [isSharing, setIsSharing] = useState(false);

  // Rounds captured as played, so a normal game can be shared as a challenge
  const planRef = useRef<ChallengeRound[]>([]);
  const createdChallengeRef = useRef<string | null>(null);
  // The results-screen pre-create's in-flight insert, so a Share tap that
  // lands before it resolves waits on it instead of creating a duplicate.
  const pendingChallengeRef = useRef<Promise<string | null> | null>(null);
  // Bumped per new game, so a previous game's late-resolving insert (Play
  // Again tapped mid-create) can't attach its link to the new game.
  const challengeGenRef = useRef(0);
  // Per-round answer times (ms), timeouts excluded -- feeds Daily's Avg
  // Response stat. Not React state: nothing needs to re-render on push.
  const roundTimesRef = useRef<number[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedForUrlRef = useRef<string | null>(null);
  // Clips already downloaded into the browser's HTTP cache
  const prefetchedUrlsRef = useRef<Set<string>>(new Set());
  const bgPreloadCancelRef = useRef(false);
  // True whenever the live round's own audio hasn't started playing yet --
  // the background prefetch queue below reads this to pause (and cancel
  // whatever it's mid-download on) so the live round always gets the
  // connection to itself when it matters, instead of competing with
  // downloads for rounds that aren't even on screen yet.
  const liveAudioBusyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Playtime/Points recording: when this game started, and whether this
  // game's session has already been recorded (results re-renders must not
  // double-submit)
  const gameStartedAtRef = useRef<number | null>(null);
  const sessionRecordedRef = useRef(false);
  // Daily / challenge replays save every answered round as it happens
  // (roundProgress.ts), so closing the tab mid-game can't be used to restart
  // with answers already seen. Set on mount once the player id is known.
  const progressRef = useRef<{ key: string; send: RoundSender; finish: () => Promise<SendOutcome> } | null>(null);
  // An unfinished play reopened before midnight (Lagos) picks up from here.
  const resumeRef = useRef<{ fromRound: number; score: number; results: boolean[]; times: number[] } | null>(null);
  // The round actually on screen -- the timeout closure set up in
  // startRound() would otherwise read a stale currentRound.
  const liveRoundRef = useRef(1);

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
      const first = await Promise.race([
        download,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
      if (first === null) {
        // Still downloading after 8s -- likely a slow connection. Rather
        // than starting the round with an unconfirmed clip (which can play
        // silently, per the mid-round stall case), tell the player and keep
        // waiting on this same in-flight download instead of giving up.
        setSlowConnection(true);
        await download;
        setSlowConnection(false);
      }
    }
    // Priming an actual <audio> element (not just warming the HTTP cache)
    // matters here: without this, tapping "Tap to Play" constructed a brand
    // new element from scratch and had to wait through load→canplay before
    // sound started — a ~1s gap even with the file already cached. Rounds
    // 2+ never had this gap because the countdown screen already does this
    // same priming; round 1 just skipped it since there's no countdown before it.
    const { audio, ready } = preloadAudio(track.previewUrl, {
      timeoutMs: 2500,
      volume,
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
      // (daily is checked first: a Daily run also carries a synthetic
      // `challenge` for the plan, which has no challenge_attempts row.)
      const pid = challenge || daily ? playerId ?? (await initializeAuth()) : null;
      resumeRef.current = null;
      if ((challenge || daily) && pid) {
        const name = () => useGameStore.getState().playerName || getSavedUsername() || "A music fan";
        const progress = daily
          ? {
              key: dailyProgressKey(daily.date, pid),
              send: ((r) => recordDailyRound(daily.date, name(), r)) as RoundSender,
              finish: () => finishDailyAttempt(daily.date),
            }
          : {
              key: challengeProgressKey(challenge!.code, pid),
              send: ((r) => recordChallengeRound(challenge!.code, name(), r)) as RoundSender,
              finish: () => finishChallengeAttempt(challenge!.code),
            };
        progressRef.current = progress;
        // Rounds answered before the tab closed (e.g. offline) go first, so
        // the attempt below reflects everything already revealed.
        await flushRounds(progress.key, progress.send);
        const attempt = daily
          ? await fetchMyDailyAttempt(daily.date, pid)
          : await fetchMyChallengeAttempt(challenge!.code, pid);
        if (attempt && !isPlayActive(attempt)) {
          navigate(daily ? "/daily" : `/c/${challenge!.code}`, { replace: true });
          return;
        }
        if (attempt) {
          const results: RoundResult[] = attempt.round_results ?? [];
          resumeRef.current = {
            fromRound: (attempt.rounds_completed ?? results.length) + 1,
            score: attempt.score,
            results: results.map((r) => !!r.c),
            times: results.filter((r) => r.ms != null).map((r) => r.ms as number),
          };
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
      const resume = resumeRef.current;
      setRoundResults(resume?.results ?? []);
      roundTimesRef.current = resume?.times ?? [];
      if (resume) {
        addSoloPoints(resume.score);
        setCurrentRound(resume.fromRound);
      }
      const firstIndex = (resume?.fromRound ?? 1) - 1;
      setTracks(planTracks);
      setPlaylistName(challenge.category_name);
      warmAudioUrl(planTracks[firstIndex + 1]?.previewUrl);
      await ensureFirstClip(planTracks[firstIndex]);
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
      50,
      playlist.isArtist,
      event ? EVENT_POOL_SIZE : undefined
    );

    if (result && result.tracks.length >= TOTAL_ROUNDS) {
      console.log(`Loaded ${result.tracks.length} tracks`);
      // Shuffle tracks once and use this order for all rounds
      const shuffledTracks = [...result.tracks].sort(() => Math.random() - 0.5);
      setRoundResults([]);
      roundTimesRef.current = [];
      planRef.current = [];
      createdChallengeRef.current = null;
      pendingChallengeRef.current = null;
      challengeGenRef.current++;
      setLinkPending(false);
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
    // Stamp the game's wall-clock start for playtime recording
    if (round === 1 || gameStartedAtRef.current === null) gameStartedAtRef.current = Date.now();
    liveRoundRef.current = round;
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
    vibrateRoundStart();

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

  // Saves this answered round right away (Daily / challenge replays only).
  const saveRound = (correct: boolean, points: number, ms: number | null) => {
    const progress = progressRef.current;
    if (!progress) return;
    enqueueRound(progress.key, { round: liveRoundRef.current, correct, points, ms }, progress.send);
  };

  const handleTimeout = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    saveRound(false, 0, null);
    setIsCorrect(false);
    setRoundResults((prev) => [...prev, false]);
    setGameState("answered");
    setIsPlaying(false);
    vibrateIncorrect();
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
    roundTimesRef.current.push(answerTime);
    saveRound(correct, points, answerTime);

    setSelectedAnswer(answer);
    setIsCorrect(correct);
    setRoundResults((prev) => [...prev, correct]);
    addSoloPoints(points);
    setGameState("answered");
    setIsPlaying(false);
    if (correct) vibrateCorrect(); else vibrateIncorrect();
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
    // Fresh game, fresh playtime/Points recording
    sessionRecordedRef.current = false;
    gameStartedAtRef.current = null;
    setPointsResult(null);
    loadTracks();
  };

  // Pre-create the challenge link before Share is ever tapped, so the tap
  // that opens the share sheet stays within the browser's user-gesture
  // window (navigator.share requires it -- iOS refuses after any network
  // wait). Runs when results appear if a name is known, or the moment one
  // is entered on the results screen. Never with a placeholder name:
  // challenges are immutable once created (no fixing creator_name later).
  const precreateChallenge = (creatorName: string) => {
    if (challenge || event || createdChallengeRef.current || pendingChallengeRef.current) return;
    if (planRef.current.length === 0) return;
    setLinkPending(true);
    const gen = challengeGenRef.current;
    pendingChallengeRef.current = createChallenge({
      creator_name: creatorName,
      creator_score: soloScore,
      category_name: playlistName || playlist?.name || "Music Quiz",
      time_per_round: ROUND_TIME / 1000,
      plan: planRef.current,
    }).then((code) => {
      if (gen !== challengeGenRef.current) return code;
      createdChallengeRef.current = code;
      pendingChallengeRef.current = null;
      setLinkPending(false);
      if (code) trackEvent("challenge_create", { challenge_code: code, score: soloScore, source: "solo" });
      return code;
    });
  };

  useEffect(() => {
    if (gameState !== "results") return;
    const knownName = playerName || getSavedUsername();
    if (knownName) precreateChallenge(knownName);
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

  // Record playtime + award Points for this game (any mode) — once.
  useEffect(() => {
    if (gameState !== "results" || sessionRecordedRef.current) return;
    sessionRecordedRef.current = true;

    const startedAt = gameStartedAtRef.current;
    if (!startedAt) return; // never actually started (defensive)
    const seconds = Math.min(3600, Math.max(5, Math.round((Date.now() - startedAt) / 1000)));
    const mode = daily ? "daily" : challenge ? "challenge" : "solo";

    (async () => {
      try {
        // (supabase as any): the generated types don't know this RPC until
        // Lovable regenerates them after the migration deploys
        const { data, error } = await (supabase as any).rpc("record_game_session", {
          p_mode: mode,
          p_name: playerName || null,
          p_score: soloScore,
          p_rounds: TOTAL_ROUNDS,
          p_seconds: seconds,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setPointsResult({ earned: row.points_earned, total: Number(row.total_points) });
      } catch (err) {
        // Points are a bonus layer — never break the results screen over them
        console.error("Failed to record game session:", err);
        logError("game.record_session_failed", "Failed to record play session", {
          mode,
          score: soloScore,
          error: (err as Error)?.message,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Every round was already saved as it was answered -- finishing just makes
  // sure nothing is still queued (and, on Leave, marks the partial score
  // final). Falls back to the old one-shot insert when the per-round RPC
  // isn't deployed yet, or when no session existed to save rounds under.
  const saveProgressOrLegacy = async (
    leftEarly: boolean,
    legacy: () => Promise<"saved" | "duplicate" | "failed">
  ): Promise<"saved" | "duplicate" | "failed"> => {
    const progress = progressRef.current;
    if (!progress) return legacy();
    const flushed = await flushRounds(progress.key, progress.send);
    if (flushed === "unavailable") {
      const result = await legacy();
      if (result !== "failed") clearPendingRounds(progress.key);
      return result;
    }
    if (flushed === "failed") return "failed";
    if (leftEarly && (await progress.finish()) === "retry") return "failed";
    return "saved";
  };

  // Records this player's (single) challenge attempt. A failed save used to
  // be silently dropped -- no session (guest sign-in never landed) skipped
  // the insert outright, and a rejected insert was ignored -- so the player
  // finished and simply never appeared on the board. Now it says so, with a
  // retry that persists until they act on it.
  const recordChallengeAttempt = async (source?: string): Promise<boolean> => {
    if (!challenge) return false;
    const pid = playerId ?? (await initializeAuth());
    const result = pid
      ? await saveProgressOrLegacy(source === "left_early", () =>
          submitChallengeAttempt(
            challenge.code,
            pid,
            playerName || getSavedUsername() || "A music fan",
            soloScore,
            roundResults.filter(Boolean).length,
            computeAvgResponseMs()
          )
        )
      : "failed";
    if (result === "failed") {
      toast.error("Your score couldn't be saved to the challenge board", {
        duration: Infinity,
        action: {
          label: "Retry",
          onClick: async () => {
            if (await recordChallengeAttempt(source)) {
              toast.success("Score saved!");
              setChallengeAttempts(await fetchChallengeAttempts(challenge.code));
            }
          },
        },
      });
      return false;
    }
    trackEvent("challenge_complete", {
      challenge_code: challenge.code,
      score: soloScore,
      correct_count: roundResults.filter(Boolean).length,
      ...(source ? { source } : {}),
    });
    return true;
  };

  // Challenge replay finished: record this player's (single) attempt, then
  // load the leaderboard. The DB unique constraint makes retries no-ops.
  useEffect(() => {
    if (gameState !== "results" || !challenge || daily) return;
    (async () => {
      await recordChallengeAttempt();
      setChallengeAttempts(await fetchChallengeAttempts(challenge.code));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Average of actually-answered rounds -- timeouts push nothing to
  // roundTimesRef, so they're excluded rather than counted as 0 or max-time.
  const computeAvgResponseMs = (): number | null => {
    const times = roundTimesRef.current;
    if (times.length === 0) return null;
    return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  };

  // Records this player's (single) Daily attempt -- same silent-drop gap
  // challenges had (see recordChallengeAttempt): no session skipped the
  // insert, a rejected insert was ignored, and the streak quietly didn't
  // extend. onSaved runs once the row is confirmed, on the first try or a
  // later Retry.
  const recordDailyAttempt = async (
    onSaved: (pid: string, savesBefore: number) => Promise<void> | void,
    leftEarly = false
  ): Promise<void> => {
    if (!daily) return;
    const pid = playerId ?? (await initializeAuth());
    // Snapshot the Save balance before submitting -- if it drops after,
    // apply_daily_attempt() silently spent one to bridge a missed day,
    // and the player should be told (it'd otherwise look like a bug:
    // "why didn't my streak reset like it always does").
    const savesBefore = pid ? (await fetchStreakProtectionStatus())?.saves_available ?? 0 : 0;
    const result = pid
      ? await saveProgressOrLegacy(leftEarly, () =>
          submitDailyAttempt(
            daily.date,
            pid,
            playerName || getSavedUsername() || "A music fan",
            soloScore,
            roundResults.filter(Boolean).length,
            computeAvgResponseMs()
          )
        )
      : "failed";
    if (!pid || result === "failed") {
      toast.error("Your Daily Challenge score couldn't be saved", {
        duration: Infinity,
        action: {
          label: "Retry",
          onClick: () => {
            recordDailyAttempt(async (p, s) => {
              toast.success("Score saved!");
              await onSaved(p, s);
            }, leftEarly);
          },
        },
      });
      return;
    }
    await onSaved(pid, savesBefore);
  };

  // Daily challenge finished: record the attempt (streak trigger runs
  // server-side), then load rank and streak for the results screen.
  useEffect(() => {
    if (gameState !== "results" || !daily) return;
    recordDailyAttempt(async (pid, savesBefore) => {
      const [{ rank, total }, stats, statusAfter] = await Promise.all([
        fetchMyDailyRank(daily.date, soloScore),
        fetchMyDailyStats(pid),
        fetchStreakProtectionStatus(),
      ]);
      const streak = isStreakActive(stats) ? stats?.current_streak ?? 0 : 0;
      setDailyResult({ rank, total, streak });
      if (statusAfter && statusAfter.saves_available < savesBefore) {
        setStreakSaveEvent("save_used");
      }
      trackEvent("daily_challenge_complete", {
        daily_number: daily.number,
        daily_date: daily.date,
        score: soloScore,
        correct_count: roundResults.filter(Boolean).length,
        rank,
        streak,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Event challenge finished: record (overwrite) this player's attempt.
  // Additive to normal Solo behavior above -- record_game_session/Points
  // still fire normally, mode stays "solo".
  // Same confirm-or-retry treatment as challenge/daily -- this one's a
  // tournament with a prize on the line, so a silently dropped run is the
  // worst place to be quiet about it.
  const recordEventAttempt = async (source?: string, isRetry = false): Promise<void> => {
    if (!event) return;
    const ok = await submitEventAttempt(
      event.slug,
      soloScore,
      roundResults.filter(Boolean).length,
      computeAvgResponseMs()
    );
    if (!ok) {
      toast.error("Your tournament score couldn't be saved", {
        duration: Infinity,
        action: { label: "Retry", onClick: () => recordEventAttempt(source, true) },
      });
      return;
    }
    if (isRetry) toast.success("Score saved!");
    trackEvent("event_challenge_complete", {
      event_slug: event.slug,
      score: soloScore,
      correct_count: roundResults.filter(Boolean).length,
      ...(source ? { source } : {}),
    });
  };

  useEffect(() => {
    if (gameState !== "results" || !event) return;
    recordEventAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Regular (non-daily) game finished: if today's Daily Challenge exists and
  // this player hasn't attempted it yet, surface a conversion-focused prompt
  // on the results screen.
  useEffect(() => {
    if (gameState !== "results" || daily || event) return;
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

  // Keep liveAudioBusyRef in sync with the state the background queue below
  // needs to read synchronously -- true whenever a round is live but its
  // audio hasn't been confirmed playing yet.
  useEffect(() => {
    liveAudioBusyRef.current = gameState === "playing" && !isPlaying;
  }, [gameState, isPlaying]);

  // Background queue: while the game plays, download the remaining rounds'
  // clips one at a time into in-memory object URLs, so every later round
  // starts instantly regardless of connection speed. Solo-only — the device
  // already knows all tracks, so there's nothing to keep secret. Pauses
  // (and cancels whatever's mid-download) whenever the live round's own
  // audio needs the connection, so background prefetching for rounds that
  // aren't even on screen yet never competes with what the player is
  // actually waiting to hear right now.
  useEffect(() => {
    if (tracks.length === 0) return;
    bgPreloadCancelRef.current = false;

    const waitUntilSafe = async () => {
      while (!bgPreloadCancelRef.current && liveAudioBusyRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
    };

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

        await waitUntilSafe();
        if (bgPreloadCancelRef.current) return;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        // Also cancel early if the live round suddenly needs the
        // connection, not just at the 8s budget.
        const busyCheckId = setInterval(() => {
          if (liveAudioBusyRef.current) controller.abort();
        }, 300);
        const ok = await prefetchAudio(track.previewUrl, controller.signal);
        clearTimeout(timeoutId);
        clearInterval(busyCheckId);
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
      volume,
    });
    // Discard any previously preloaded audio.
    if (preloadedAudioRef.current) {
      preloadedAudioRef.current.pause();
      preloadedAudioRef.current.src = "";
    }
    preloadedAudioRef.current = audio;
    preloadedForUrlRef.current = nextTrack.previewUrl;
  }, [gameState, currentRound, tracks, volume]);

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
      const desiredVolume = volume;
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

      // Keep watching for the whole round, not just the initial start --
      // a healthy connection can still run dry mid-clip (buffer underrun),
      // silently pausing with no sound until enough rebuffers. "waiting"
      // fires whenever that happens; "playing" fires both on first start
      // and every time it resumes, so the same handler covers both.
      const onWaiting = () => {
        setSlowConnection(true);
        setIsPlaying(false);
      };
      const onPlaying = () => {
        setSlowConnection(false);
        setIsPlaying(true);
      };
      audio.addEventListener("waiting", onWaiting);
      audio.addEventListener("playing", onPlaying);

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

      return () => {
        audio.removeEventListener("waiting", onWaiting);
        audio.removeEventListener("playing", onPlaying);
        if (audioRef.current === audio) {
          audio.pause();
          audio.src = '';
          audioRef.current = null;
        }
      };
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
      audioRef.current.volume = volume;
    }
  }, [volume]);

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
              <p className="text-xl text-foreground/80">Loading {challenge?.category_name || playlistName || playlist?.name || "tracks"}...</p>
              {slowConnection && (
                <>
                  <p className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/15 border border-destructive/40 text-sm text-destructive">
                    <WifiOff className="w-3.5 h-3.5 shrink-0" />
                    Slow connection — still loading
                  </p>
                  <Button
                    variant="ghost"
                    className="mt-4"
                    onClick={() => {
                      cleanupGame();
                      navigate(challenge && !daily ? `/c/${challenge.code}` : daily ? "/daily" : event ? `/${event.slug}` : "/solo");
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </>
              )}
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
            {currentRound > 1
              ? `Picking up at song ${currentRound} of ${TOTAL_ROUNDS} · ${soloScore} pts so far`
              : `${TOTAL_ROUNDS} songs · ${ROUND_TIME / 1000}s each`}
          </p>
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            onClick={() => startRound(tracks, currentRound)}
          >
            <Play className="w-5 h-5 mr-2" />
            {currentRound > 1 ? "Tap to Continue" : "Tap to Play"}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full mt-2"
            onClick={() => {
              cleanupGame();
              navigate(challenge && !daily ? `/c/${challenge.code}` : daily ? "/daily" : event ? `/${event.slug}` : "/solo");
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
      if (isSharing) return;
      setIsSharing(true);
      try {
      trackEvent("share_result", {
        mode: daily ? "daily" : challenge ? "challenge" : "solo",
        score: soloScore,
      });

      // No confirmed challenge link yet -- either the results-screen
      // pre-create is still in flight, it failed, or it was skipped because
      // no name was known. Never share a code that isn't confirmed saved:
      // a link to a row that never landed (e.g. the insert was rejected for
      // an unauthenticated session) opens as "Challenge not found".
      if (!challenge && !createdChallengeRef.current && planRef.current.length > 0) {
        const knownName = playerName || getSavedUsername();
        if (knownName) {
          const code = await (pendingChallengeRef.current ??
            createChallenge({
              creator_name: knownName,
              creator_score: soloScore,
              category_name: playlistName || playlist?.name || "Music Quiz",
              time_per_round: ROUND_TIME / 1000,
              plan: planRef.current,
            }).then((c) => {
              if (c) trackEvent("challenge_create", { challenge_code: c, score: soloScore, source: "solo" });
              return c;
            }));
          createdChallengeRef.current = code;

          if (!code) {
            toast.error("Couldn't create your challenge link — check your connection and try again");
            return;
          }
          if (isIOSDevice()) {
            // Waiting on that insert spent this tap's user gesture, and
            // iOS won't open the share sheet without a fresh one -- the
            // link is confirmed saved now, so the next tap shares instantly.
            toast.success("Your challenge link is ready — tap Share again to send it");
            return;
          }
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

      // A fresh challenge link (not one accepted from someone else) counts
      // toward the creator's own repair progress if they're mid-window --
      // frame the share as "help me," not just "beat my score."
      let text = buildShareText(cardOpts);
      // Skipped on iOS -- same user-gesture reasoning as above; the plain
      // "beat my score" text still goes out, just without this framing.
      if (code && !challenge && !isIOSDevice()) {
        const status = await fetchStreakProtectionStatus();
        if (status?.status === "repair") {
          text = buildStreakRepairShareText({ streak: status.current_streak, challengeUrl: challengeUrl(code) });
        }
      }

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
      } finally {
        setIsSharing(false);
      }
    };

    const hasName = !!(playerName || getSavedUsername()).trim();

    // Saving the name starts link creation right away, while they're still
    // looking at their score -- by the time they reach for Share it's ready.
    const handleNameSubmit = () => {
      const trimmed = nameInput.trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 20);
      if (!trimmed) return;
      saveUsername(trimmed);
      setPlayer(trimmed, avatarIndex);
      precreateChallenge(trimmed);
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

          <div className="bg-background/50 rounded-xl border border-gold/20 p-5 mb-6">
            <div className="flex items-center justify-center gap-4 sm:gap-6">
              <div className="flex-1 text-center">
                <p
                  className="font-display text-4xl sm:text-5xl font-black text-gold"
                  style={{ filter: "drop-shadow(0 0 16px hsl(var(--gold) / 0.5))" }}
                >
                  {soloScore}
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-foreground/60 mt-1">Points</p>
              </div>
              <div className="w-px h-12 bg-border shrink-0" />
              <div className="flex-1 text-center">
                <p className="font-display text-[2rem] font-black text-foreground">
                  {percentage}%
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-foreground/60 mt-1">Accuracy</p>
              </div>
            </div>
            {roundResults.length > 0 && (
              <p className="text-base mt-4 tracking-wider text-center" aria-hidden="true">
                {roundResults.map((r) => (r ? "🟩" : "🟥")).join("")}
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

          {daily && (
            <div className="bg-background/50 rounded-xl p-4 mb-6">
              <p className="text-muted-foreground mb-2">Daily Challenge #{daily.number}</p>
              {dailyResult ? (
                <>
                  <p className="text-2xl font-bold text-primary mb-1">
                    #{dailyResult.rank} <span className="text-base font-normal text-foreground/70">of {dailyResult.total} today</span>
                  </p>
                  {dailyResult.streak > 0 && (
                    [7, 30, 100].includes(dailyResult.streak) ? (
                      <motion.p
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                        className="font-bold text-gold text-lg"
                      >
                        🎉 {dailyResult.streak}-day streak milestone!
                      </motion.p>
                    ) : (
                      <p className="font-semibold text-gold">🔥 {dailyResult.streak}-day streak</p>
                    )
                  )}
                  <p className="text-muted-foreground text-xs mt-2">Come back tomorrow to keep it alive!</p>
                  <DailyReminderButton className="mt-3" />
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Saving your result…</p>
              )}
            </div>
          )}

          <StreakSaveModal
            event={streakSaveEvent}
            streak={dailyResult?.streak ?? 0}
            onClose={() => setStreakSaveEvent(null)}
          />

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

          <SaveProgressPrompt />

          {event ? (
            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/${event.slug}`)}
              >
                View Leaderboard
              </Button>
              <Button
                variant="gold"
                className="flex-1"
                onClick={handlePlayAgain}
              >
                Play Again
              </Button>
            </div>
          ) : (
            <>
              {!hasName && (
                <div className="mb-3 text-left">
                  <label htmlFor="share-name" className="block text-xs text-muted-foreground mb-1.5">
                    Add your name to challenge friends
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="share-name"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Your nickname"
                      maxLength={20}
                      onKeyDown={(e) => e.key === "Enter" && nameInput.trim() && handleNameSubmit()}
                    />
                    <Button variant="outline" onClick={handleNameSubmit} disabled={!nameInput.trim()}>
                      Save
                    </Button>
                  </div>
                </div>
              )}
              <Button
                variant="gold"
                size="lg"
                className="w-full mb-4"
                onClick={doShare}
                disabled={isSharing || !hasName || linkPending}
              >
                <Share2 className="w-5 h-5 mr-2" />
                {linkPending
                  ? "Preparing your link…"
                  : challenge && !daily
                  ? "Share Result"
                  : "Challenge your friends"}
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
            </>
          )}

          {!daily && !event && dailyPromo && (
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

      </div>
    );
  }

  const isTimeLow = (timeLeft / ROUND_TIME) * 100 < 30;

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
      <div className="relative z-10 p-4 safe-area-inset-top">
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
                <AlertDialogTitle>
                  {challenge && !daily ? "Leave Challenge?" : daily ? "Leave Daily Challenge?" : event ? "Leave Event Challenge?" : "Leave Game?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {(challenge || daily) && roundResults.length === 0
                    ? "You haven't answered any songs yet, so nothing is recorded — you can come back and play later."
                    : challenge && !daily
                    ? `This ends the challenge — your current score (${soloScore} pts) will be recorded as your final score. You won't be able to play this challenge again.`
                    : daily
                    ? `This ends today's challenge — your current score (${soloScore} pts) will be recorded as your final score. You won't be able to play today's challenge again.`
                    : event
                    ? `This ends your run — your current score (${soloScore} pts) will be recorded. You can always play again.`
                    : "Are you sure you want to quit? Your current progress will be lost."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Playing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    // Nothing answered yet = nothing to record; they can
                    // come back and start fresh.
                    const answeredAny = roundResults.length > 0;
                    if (challenge && !daily) {
                      if (answeredAny) await recordChallengeAttempt("left_early");
                    } else if (daily && !answeredAny) {
                      // nothing to record
                    } else if (daily) {
                      await recordDailyAttempt(async (_pid, savesBefore) => {
                        const statusAfter = await fetchStreakProtectionStatus();
                        if (statusAfter && statusAfter.saves_available < savesBefore) {
                          toast.success(`🛡️ Streak Save used — your ${statusAfter.current_streak}-day streak is protected!`);
                        }
                        trackEvent("daily_challenge_complete", {
                          daily_number: daily.number,
                          daily_date: daily.date,
                          score: soloScore,
                          correct_count: roundResults.filter(Boolean).length,
                          source: "left_early",
                        });
                      }, true);
                    } else if (event) {
                      await recordEventAttempt("left_early");
                    }
                    cleanupGame();
                    resetSoloGame();
                    navigate(challenge && !daily ? `/c/${challenge.code}` : daily ? "/daily" : event ? `/${event.slug}` : "/solo");
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {challenge && !daily ? "Leave Challenge" : daily ? "Leave Daily" : event ? "Leave Event" : "Leave Game"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground hidden sm:inline">Round</span>
            <span className="round-dot active w-7 h-7 text-sm shrink-0">{Math.max(currentRound, 1)}</span>
            <span className="text-sm text-muted-foreground">/ {TOTAL_ROUNDS}</span>
          </div>
          <div className="hidden md:block">
            <ConnectionBadge quality={connectionQuality} />
          </div>
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
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Score</p>
            <motion.p
              key={soloScore}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              transition={CARD_SPRING}
              className="text-2xl md:text-3xl font-black text-foreground"
            >
              {soloScore}
            </motion.p>
          </div>
          <VolumeControl volume={volume} onVolumeChange={setVolume} />
        </div>
        </div>

        {/* Time remaining — mobile only, restored to the original label-left/value-right row */}
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
            animate={{ width: `${Math.min(100, (timeLeft / ROUND_TIME) * 100)}%` }}
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
      <div className="relative z-10 flex flex-col items-center justify-center px-4 py-8">
        {/* Connection quality — header row is too cramped for it on mobile */}
        <div className="mb-3 md:hidden">
          <ConnectionBadge quality={connectionQuality} />
        </div>

        {/* Question Type Indicator */}
        <motion.div
          key={`${currentRound}-${questionType}`}
          initial={{ opacity: 0, scale: 0.9, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={CARD_SPRING}
          className="mb-6 px-4 py-2 rounded-full bg-gold"
          style={{ boxShadow: "var(--shadow-glow), var(--shadow-inset-highlight)" }}
        >
          <p className="font-display text-xs font-extrabold text-background tracking-wide">
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
              className="mb-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/15 border border-destructive/40 text-xs font-semibold text-destructive"
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
