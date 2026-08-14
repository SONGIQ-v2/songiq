import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic, type AppleMusicTrack } from "@/hooks/useAppleMusic";
import { getPlaylistById, PLAYLISTS } from "@/lib/playlists";
import { toast } from "sonner";
import { logError, logWarn, logInfo } from "@/lib/clientLogger";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";
import { prefetchAudio } from "@/lib/audioPreload";

export interface MultiplayerPlayer {
  id: string;
  player_id: string;
  player_name: string;
  avatar_index: number;
  score: number;
  is_host: boolean;
  is_ready: boolean;
  joined_at: string;
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
// Kahoot-style reveal window after every round end (early or natural):
// grading + everyone's picks show on the answer cards for this long before
// the between-rounds countdown. Purely client-side — the server schedules
// the next round 5s after the advance call, which this window delays.
const REVEAL_MS = 3000;
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

export interface ReactionEvent {
  id: string;
  emoji: string;
  playerName: string;
  avatarIndex: number;
  isSelf: boolean;
}

export function useMultiplayerGame(roomCode: string) {
  const { playerId, playerName, avatarIndex, isHost: storeIsHost, setRoom: setStoreRoom, isInitialized } = useGameStore();
  const { getPlaylistTracks } = useAppleMusic();

  // Room state
  const [room, setRoom] = useState<RoomData | null>(null);
  // Which of the room's players are signed in (not anonymous) -- shown as a
  // badge next to their name (Room Lobby, in-game leaderboard, Podium).
  // Re-fetched only when who's in the room changes, not on every score
  // update.
  const [verifiedPlayerIds, setVerifiedPlayerIds] = useState<Set<string>>(new Set());
  const [players, setPlayers] = useState<MultiplayerPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute ROUND_TIME from room settings (time_per_round is in seconds)
  const ROUND_TIME = room ? room.time_per_round * 1000 : DEFAULT_ROUND_TIME;
  const isHost = room && playerId ? room.host_id === playerId : storeIsHost;

  // Stable across score updates (only changes when who's in the room does),
  // so this doesn't re-fetch on every round.
  const playerIdsKey = players.map((p) => p.player_id).sort().join(",");
  useEffect(() => {
    if (!playerIdsKey) return;
    fetchVerifiedPlayerIds(playerIdsKey.split(",")).then(setVerifiedPlayerIds);
  }, [playerIdsKey]);

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
  // True during the post-round reveal window: grading + everyone's picks
  // show on the answer cards. gameStatus stays "playing" so the page keeps
  // rendering the round screen.
  const [revealActive, setRevealActive] = useState(false);
  // Who picked what this round (option text -> player_ids), for the reveal.
  // Fed live by the player_answers broadcast, reconciled by a fetch at
  // reveal start in case a broadcast was dropped.
  const [roundAnswers, setRoundAnswers] = useState<Record<string, string[]>>({});

  // Emoji reactions -- ephemeral, not persisted anywhere. Floats up the
  // screen for a few seconds then self-removes (see the timeout in
  // sendReaction/handleReactionBroadcast below).
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  // Must be >= FloatingReactions' animation duration (EmojiReactions.tsx) so
  // a reaction never gets removed from state mid-flight.
  const REACTION_LIFETIME_MS = 5400;

  // The room's Broadcast channel, kept in a ref (not just a local variable
  // in the subscription effect below) so sendReaction can use it from
  // outside that effect.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Player IDs currently tracked as present on the room's realtime channel --
  // kept in a ref (not state) since it's read by an interval, not rendered.
  const onlinePlayerIdsRef = useRef<Set<string>>(new Set());
  // Host id this client last saw -- used only to fire a toast on the
  // transition (initial fetch shouldn't toast "so-and-so is now the host").
  const lastKnownHostIdRef = useRef<string | null>(null);
  // Declared here (rather than with the rest of the player-delta state
  // below) so sendReaction can read the room's own record of this player's
  // name -- the same name everyone else already sees on avatars/leaderboard
  // -- instead of gameStore's copy, which can lag or be empty depending on
  // hydration timing and would silently broadcast the literal "Player"
  // fallback to the whole room.
  const playersMapRef = useRef<Map<string, MultiplayerPlayer>>(new Map());

  const addReaction = useCallback((r: Omit<ReactionEvent, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setReactions((prev) => [...prev, { ...r, id }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((x) => x.id !== id));
    }, REACTION_LIFETIME_MS);
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    const roomName = playerId ? playersMapRef.current.get(playerId)?.player_name : undefined;
    const payload = { emoji, playerName: roomName || playerName || "Player", avatarIndex };
    addReaction({ ...payload, isSelf: true }); // optimistic local echo -- broadcast sends don't loop back to the sender
    channelRef.current?.send({ type: "broadcast", event: "reaction", payload });
  }, [addReaction, playerId, playerName, avatarIndex]);

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
  // Own server-graded result, held back until the reveal so a player can't
  // tell right from wrong the moment they answer (the ticker flushes this
  // into isCorrect when the reveal window opens)
  const pendingGradeRef = useRef<{ roundId: string; isCorrect: boolean } | null>(null);
  // Round id whose reveal reconciliation fetch has run
  const revealFetchedForRef = useRef<string | null>(null);
  // Scores as they stood when the round started — displayed during the
  // round so live server-side score updates can't leak who answered right
  const scoreSnapshotRef = useRef<Map<string, number>>(new Map());

  // Player delta state: source-of-truth map (declared above, near
  // sendReaction) + throttled flush to React state
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

  // Prefetch the current round's clip into the browser's HTTP cache the
  // instant its preview_url is public -- this hook is mounted on RoomLobby
  // too, so a game started while a player is still on that route already
  // has a head start on the fetch by the time MultiplayerGame.tsx mounts
  // and actually needs to play it. Never touches round N+1: game_rounds
  // only gets a round's row inserted 5s before that round starts, so
  // there's nothing to prefetch ahead of time even if this wanted to.
  const prefetchedUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const url = currentRound?.preview_url;
    if (!url || gameStatus === "playing") return;
    if (prefetchedUrlsRef.current.has(url)) return;
    prefetchedUrlsRef.current.add(url);
    prefetchAudio(url);
  }, [currentRound?.preview_url, gameStatus]);

  const fetchRoom = useCallback(async () => {
    try {
      // Via the RPC, not a direct table select -- game_rooms/room_players
      // are now members-only, but a brand-new visitor calling this before
      // they've joined legitimately needs to see the room (and who's
      // already in it) to render the lobby at all. See
      // 20260823090000_stop_listing_every_room.sql.
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc("get_room_by_code", {
        p_code: roomCode,
      });
      if (rpcError) throw rpcError;
      if (!rpcData) throw new Error("Room not found");
      const roomData = rpcData.room as RoomData;
      const playersData = rpcData.players as MultiplayerPlayer[];

      setRoom(roomData);

      // Sync isHost in the game store based on actual room data
      if (playerId) {
        setStoreRoom(roomData.id, roomData.room_code, roomData.host_id === playerId);
      }

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
              // Held back like a fresh answer — the ticker flushes it into
              // isCorrect once the round's reveal window opens
              pendingGradeRef.current = { roundId: round.id, isCorrect: answerData.is_correct };
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
        // answer/is_correct/points_earned are stripped from this broadcast
        // server-side now (see broadcast_player_answers_change()) -- an
        // opponent's pick and correctness are only knowable after the
        // round's reveal, not live as each player answers. Only the
        // presence of the event itself (hasAnswered) is safe to use here;
        // roundAnswers and roundScore are populated by the reveal-time
        // reconciliation fetch below instead, once player_answers' own RLS
        // allows seeing them (round_id references a game_rounds row with
        // ended_at set).
        const answer = record as unknown as { player_id: string; round_id: string };
        if (answer.round_id !== roundRef.current?.id) return; // stale round
        setPlayers((prev) =>
          prev.map((p) => (p.player_id === answer.player_id ? { ...p, hasAnswered: true } : p))
        );
        // Own server-graded result arrives via submitAnswer()'s own insert
        // response (select("is_correct, points_earned") on the just-
        // inserted row, which own-row RLS always allows) -- not from here.
      }
    }
  }, [playerId, scheduleFlushPlayers, ingestRound]);

  // realtime.messages now gates room:<id> broadcasts to actual room
  // participants (see 20260824090000_gate_realtime_to_members.sql) -- a
  // visitor who fetched the room before joining (every new joiner, since
  // fetchRoom always runs first) would have this subscription denied on
  // the very first attempt. Re-running the effect once membership is
  // confirmed retries it, this time successfully. Without this, anyone who
  // joined via this path would be silently stuck on the 3s poll for their
  // entire session instead of getting broadcasts.
  const isConfirmedMember = players.some((p) => p.player_id === playerId);

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
        .channel(`room:${room.id}`, { config: { private: true, presence: { key: playerId ?? undefined } } })
        .on("broadcast", { event: "INSERT" }, (msg) => handleBroadcast(msg.payload))
        .on("broadcast", { event: "UPDATE" }, (msg) => handleBroadcast(msg.payload))
        .on("broadcast", { event: "DELETE" }, (msg) => handleBroadcast(msg.payload))
        .on("broadcast", { event: "reaction" }, (msg) => {
          const p = msg.payload as { emoji?: string; playerName?: string; avatarIndex?: number };
          if (!p?.emoji) return;
          // Sender already added their own reaction locally (sendReaction) --
          // broadcast doesn't loop back to the sender anyway, so every
          // arrival here is genuinely from someone else.
          addReaction({ emoji: p.emoji, playerName: p.playerName || "Player", avatarIndex: p.avatarIndex ?? 1, isSelf: false });
        })
        // Presence: who's actually connected right now. Drives the "host
        // went inactive" watcher below -- a disconnect (closed tab, crash,
        // dropped connection) drops out of sync/leave within seconds,
        // without any polling.
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState();
          onlinePlayerIdsRef.current = new Set(Object.keys(state));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            logInfo("realtime.subscribed", "Room broadcast channel subscribed", { roomId: room.id, roomCode: room.room_code });
            if (playerId) await channel!.track({ player_id: playerId, online_at: new Date().toISOString() });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            logWarn("realtime.disconnected", `Room broadcast channel ${status}`, { roomId: room.id, roomCode: room.room_code, status });
          }
        });
      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [room?.id, playerId, isConfirmedMember, handleBroadcast, addReaction]);

  // Heartbeat: refresh this player's own last_seen every 15s while mounted
  // in the room. transfer_host_if_inactive() treats a stale last_seen as the
  // ground truth for "host is actually gone" -- Presence alone (above) can
  // false-positive on a brief reconnect, this can't.
  useEffect(() => {
    if (!room?.id || !playerId) return;
    const beat = () => {
      supabase
        .from("room_players")
        .update({ last_seen: new Date().toISOString() })
        .eq("room_id", room.id)
        .eq("player_id", playerId)
        .then(() => {});
    };
    beat();
    const interval = setInterval(beat, 15000);
    return () => clearInterval(interval);
  }, [room?.id, playerId]);

  // Host-inactivity watcher: any non-host player, while Presence shows the
  // host missing from the room's realtime channel, periodically asks the
  // server to hand off host. transfer_host_if_inactive() re-verifies via
  // last_seen before acting, so this is safe to call speculatively --
  // harmless no-op if the host is just mid-reconnect.
  useEffect(() => {
    if (!room?.id || !playerId || room.host_id === playerId) return;

    const check = () => {
      if (onlinePlayerIdsRef.current.size === 0) return; // presence not synced yet
      if (onlinePlayerIdsRef.current.has(room.host_id)) return; // host is here
      (supabase as any).rpc("transfer_host_if_inactive", { p_room_id: room.id }).then(
        ({ error }: { error: { message: string } | null }) => {
          if (error) {
            logWarn("multiplayer.host_transfer_check_failed", error.message, { roomId: room.id });
          }
        }
      );
    };
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [room?.id, room?.host_id, playerId]);

  // Toast on host handoff -- both for the newly-promoted host and everyone
  // else. Skips the very first render's assignment (that's just the initial
  // fetch, not a real transition).
  useEffect(() => {
    if (!room) return;
    const prevHostId = lastKnownHostIdRef.current;
    lastKnownHostIdRef.current = room.host_id;
    if (prevHostId === null || prevHostId === room.host_id) return;

    if (room.host_id === playerId) {
      toast.info("You're the host now — the previous host left or disconnected.");
    } else {
      const newHostName = playersMapRef.current.get(room.host_id)?.player_name ?? room.host_name;
      toast.info(`${newHostName} is now the host.`);
    }
  }, [room, playerId]);

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
      const roundEnd = endedAtMs !== null ? Math.min(naturalEnd, endedAtMs) : naturalEnd;
      // Every round end (early or natural) is followed by the reveal window,
      // then the between-rounds countdown.
      const revealEnd = roundEnd + REVEAL_MS;

      // Held-back own grade becomes visible once the round is over
      const flushPendingGrade = () => {
        if (pendingGradeRef.current && pendingGradeRef.current.roundId === round.id) {
          setIsCorrect(pendingGradeRef.current.isCorrect);
          pendingGradeRef.current = null;
        }
      };

      if (now < start) {
        // Counting down to this round's start
        const secs = Math.max(1, Math.ceil((start - now) / 1000));
        setTimeLeft(ROUND_TIME);
        setRevealActive(false);
        if (round.round_number === 1) {
          setPreGameCountdown(secs);
          setGameStatus("pre_game");
        } else {
          setBetweenRoundsCountdown(secs);
          setGameStatus("between_rounds");
        }
      } else if (now < roundEnd) {
        // Round is live — no grading visible yet
        if (lastResetRoundRef.current !== round.id) {
          lastResetRoundRef.current = round.id;
          setHasAnswered(false);
          setSelectedAnswer(null);
          setIsCorrect(null);
          setRoundAnswers({});
          pendingGradeRef.current = null;
          // Freeze displayed scores at their pre-round values so live
          // server-side score updates can't leak correctness mid-round
          scoreSnapshotRef.current = new Map(
            Array.from(playersMapRef.current.values()).map((p) => [p.player_id, p.score])
          );
          setPlayers((prev) => prev.map((p) => ({ ...p, roundScore: 0, hasAnswered: false })));
        }
        setTimeLeft(Math.max(0, naturalEnd - now));
        setPreGameCountdown(0);
        setBetweenRoundsCountdown(0);
        setRevealActive(false);
        setGameStatus("playing");
      } else if (now < revealEnd) {
        // Reveal window: same round screen, everyone's picks + grading shown
        setTimeLeft(0);
        setPreGameCountdown(0);
        setBetweenRoundsCountdown(0);
        flushPendingGrade();
        setRevealActive(true);
        setGameStatus((prev) => (prev === "results" || prev === "terminated" ? prev : "playing"));
      } else {
        // Round over; waiting for the next round (or the finish)
        setTimeLeft(0);
        setRevealActive(false);
        flushPendingGrade();
        const overMs = now - revealEnd;
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

  // Reveal reconciliation. Other players' answer/points_earned are stripped
  // from the live broadcast now (see broadcast_player_answers_change()) and
  // player_answers' own RLS only exposes them once the round's ended_at is
  // set -- so this fetch is the sole source for both roundAnswers (who
  // picked what) and everyone's roundScore, not just a missed-broadcast
  // backstop like it used to be.
  useEffect(() => {
    if (!revealActive || !currentRound) return;
    if (revealFetchedForRef.current === currentRound.id) return;
    revealFetchedForRef.current = currentRound.id;

    const roundId = currentRound.id;
    const expectedCount = players.length;
    // Applies whatever rows come back (never discards partial data), and
    // separately reports whether it looked complete -- fewer rows than
    // players in the room means either the ended_at RLS gate above hasn't
    // opened for us yet (only our own row visible), or another client's own
    // timeout-answer insert is still in flight. Either way that's worth one
    // retry, but a still-incomplete result after the retry is still better
    // shown than discarded.
    const fetchAnswers = async () => {
      const { data, error } = await supabase
        .from("player_answers")
        .select("answer, player_id, points_earned")
        .eq("round_id", roundId);
      if (error || !data) return false;

      setRoundAnswers((prev) => {
        const merged = { ...prev };
        for (const row of data) {
          if (!(row.answer ?? "").trim()) continue; // timed out, no pick
          const list = merged[row.answer] ?? [];
          if (!list.includes(row.player_id)) merged[row.answer] = [...list, row.player_id];
        }
        return merged;
      });
      setPlayers((prev) =>
        prev.map((p) => {
          const row = data.find((r) => r.player_id === p.player_id);
          return row ? { ...p, roundScore: row.points_earned } : p;
        })
      );
      return data.length >= expectedCount;
    };

    (async () => {
      const complete = await fetchAnswers();
      // player_answers' "full room" visibility only opens once ended_at is
      // set server-side; revealActive is a client-clock guess that can
      // fire a beat before that DB write lands. One retry shortly after
      // covers that race -- unlike the round's own answer (game_rounds),
      // there's no separate polling fallback for this data.
      if (!complete) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await fetchAnswers();
      }
    })();
  }, [revealActive, currentRound?.id]);

  // Learn the real answer once the round is confirmed ended server-side.
  // Broadcasts no longer carry track_name/artist_name at all (see
  // broadcast_game_rounds_change()), so this fetch -- not a missed-
  // broadcast fallback -- is now the primary way a non-host client ever
  // learns it. Keyed off ended_at itself (not revealActive, which is a
  // client-clock guess that can fire slightly before the server has
  // actually set ended_at in the rare case nothing has called
  // advance_game_round() yet) rather than a fixed delay -- the existing 3s
  // polling fallback below independently re-syncs the same field too, so a
  // dropped broadcast here still self-heals within a few seconds either way.
  const revealedAnswerFetchedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentRound?.id || !currentRound.ended_at || currentRound.track_name) return;
    if (revealedAnswerFetchedForRef.current === currentRound.id) return;
    revealedAnswerFetchedForRef.current = currentRound.id;

    (async () => {
      const { data } = await (supabase as any)
        .from("game_rounds_public")
        .select("id, track_name, artist_name")
        .eq("id", currentRound.id)
        .maybeSingle();
      if (data?.track_name) {
        ingestRound({ ...currentRound, ...data } as RoundData);
      }
    })();
  }, [currentRound?.id, currentRound?.ended_at, currentRound?.track_name, ingestRound]);

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
      if (isFinal) setIsFinalizingResults(true);
      // advance_game_round is idempotent server-side (row lock + status
      // checks), so retrying from here -- or from another room member's own
      // copy of this same effect -- is always safe. Marking "requested"
      // only on a confirmed success (not before the call, like this used
      // to) matters: a single transient failure used to permanently strand
      // the game in "between_rounds" forever, since nothing else would ever
      // call this again for that round.
      const MAX_ATTEMPTS = 4;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const { error: rpcError } = await (supabase as any).rpc("advance_game_round", {
            _room_id: room.id,
          });
          if (rpcError) throw rpcError;
          advanceRequestedForRef.current = currentRound.id;
          return;
        } catch (err) {
          console.error(`Error advancing round (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
          logError("multiplayer.advance_failed", "advance_game_round RPC failed", {
            roomId: room.id,
            roomCode: room.room_code,
            roundNumber: currentRound.round_number,
            attempt,
            error: (err as Error)?.message,
          }, (err as Error)?.stack);
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          }
        }
      }
      // Every attempt failed -- surface it rather than hanging silently;
      // the 3s poll will still pick up the finish if another room member's
      // retry (or the poll itself, next reconciliation) succeeds meanwhile.
      toast.error("Having trouble finishing the game — still trying in the background.");
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
        // Via the RPC (see fetchRoom above) -- also returns the players
        // list in the same call, so this replaces the separate
        // room_players reconciliation query below too.
        const { data: rpcData, error: roomErr } = await (supabase as any).rpc("get_room_by_code", {
          p_code: roomCode,
        });

        if (roomErr) return; // transient error — don't treat as room-deleted
        if (!rpcData) {
          // Room was deleted (host left)
          setRoom(null);
          setGameStatus("terminated");
          return;
        }
        const roomData = rpcData.room as RoomData;

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
        const playersData = rpcData.players as MultiplayerPlayer[];

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

      // Hold the grade back — the ticker reveals it when the round ends
      if (typeof inserted?.is_correct === "boolean") {
        pendingGradeRef.current = { roundId: currentRound.id, isCorrect: inserted.is_correct };
      }
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
    const result = await getPlaylistTracks(playlist.searchTerms, playlist.name, 50, playlist.isArtist);
    if (result?.tracks) {
      // Shuffle tracks to ensure unique, non-repeating order each game
      return shuffleArray(result.tracks);
    }
    return [];
  }, [getPlaylistTracks]);

  // Build the full round plan (track + question type + options per round).
  // Stored server-side so advance_game_round() can create rounds without
  // depending on the host's browser being awake.
  const buildRoundPlan = useCallback((tracks: AppleMusicTrack[], isArtistPlaylist: boolean) => {
    // An artist-spotlight playlist is only ever "Guess the Song" — features/
    // collabs can make the pool's artist names look diverse enough for
    // "Guess the Artist" to technically work, but that defeats the point of
    // an artist playlist. Any other playlist still needs the diversity check
    // as a safety net against unexpectedly narrow pools.
    const uniqueArtists = new Set(tracks.map((t) => t.artistName)).size;
    const canGuessArtist = !isArtistPlaylist && uniqueArtists >= 4;

    const maxRounds = Math.min(tracks.length, 20); // 20 = largest rounds setting
    return tracks.slice(0, maxRounds).map((track) => {
      const questionType = canGuessArtist
        ? QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)]
        : "Guess the Song";
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

      const plan = buildRoundPlan(loadedTracks, !!getPlaylistById(category)?.isArtist);
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
      // The disabled Start Game button already covers the common case; this
      // is the DB-level backstop (a player leaving in the split second
      // between the button click and the update landing) surfacing as an
      // RLS rejection -- worth a specific message rather than the generic one.
      const notEnoughPlayers = (err as { code?: string })?.code === "42501";
      toast.error(notEnoughPlayers ? "Need at least 2 players to start" : "Failed to start game");
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
    setRevealActive(false);
    setRoundAnswers({});
    pendingGradeRef.current = null;
    revealFetchedForRef.current = null;
    scoreSnapshotRef.current = new Map();
  }, [room, playerId, isHost]);

  // Leave room. If the leaving player is the host, hands off to whoever
  // joined earliest instead of ending the game for everyone else -- only
  // closes the room outright when no one else remains. game_rooms' RLS
  // requires auth.uid() = host_id in WITH CHECK, so even the outgoing host
  // can't reassign host_id via a plain client update; the SECURITY DEFINER
  // RPC is what actually performs the handoff.
  const leaveRoom = useCallback(async () => {
    if (!room || !playerId) return;
    const { error: leaveErr } = await (supabase as any).rpc("leave_room_with_handoff", {
      p_room_id: room.id,
    });
    if (leaveErr) {
      logError("multiplayer.leave_failed", "leave_room_with_handoff RPC failed", {
        roomId: room.id,
        roomCode: room.room_code,
        error: leaveErr.message,
      });
    }
  }, [room, playerId]);

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

  // While a round is live (before its reveal), show scores frozen at their
  // pre-round values with round scores hidden — the server updates
  // room_players.score the instant an answer is graded, and a live jump in
  // the leaderboard would reveal right/wrong before the reveal window.
  // hasAnswered stays visible (the ✓ indicators are correctness-neutral).
  const visiblePlayers = useMemo(() => {
    if (gameStatus !== "playing" || revealActive) return players;
    const frozen = players.map((p) => ({
      ...p,
      score: scoreSnapshotRef.current.get(p.player_id) ?? p.score,
      roundScore: 0,
    }));
    frozen.sort((a, b) => b.score - a.score);
    // Static ranks mid-round; rank-change animations play at the reveal
    return frozen.map((p, i) => ({ ...p, previousRank: i + 1, currentRank: i + 1 }));
  }, [players, gameStatus, revealActive]);

  return {
    room,
    players: visiblePlayers,
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
    revealActive,
    roundAnswers,
    reactions,
    sendReaction,
    verifiedPlayerIds,
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
    fetchRoom,
  };
}
