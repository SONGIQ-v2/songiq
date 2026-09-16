import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Play, Lock, Headphones, Zap, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { getKnownPlayerName, saveUsername } from "@/lib/challenges";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";
import { trackEvent } from "@/lib/analytics";
import { fetchEvent, fetchEventLeaderboard, fetchMyEventAttempt, type Event, type EventAttempt } from "@/lib/events";

// This page is a one-off, hand-designed look for the Beach & Beyond
// partnership (built from a Stitch mockup) -- distinct from the standard
// SongIQ dark/gold look the Daily/Challenge boards share. A future event
// with its own branding gets its own bespoke page rather than trying to
// force this exact tournament-arena look into a generic template.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Same pattern as StreakRepairNotification.tsx -- counts down to an
// arbitrary DB-supplied timestamp, not the recurring-midnight pattern
// Daily/Index use.
function formatCountdown(deadline: string): string {
  const totalSeconds = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

function formatSpeed(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

const RANK_BADGE = ["🏆", "🥈", "🥉"];
const RANK_LABEL = ["#1 CHAMPION", "2nd Contender", "3rd Contender"];

export default function EventChallenge({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const { initializeAuth, playerId, setPlayer, openSignInModal, setCategory } = useGameStore();

  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");
  const [event, setEvent] = useState<Event | null>(null);
  const [attempts, setAttempts] = useState<EventAttempt[]>([]);
  const [myAttempt, setMyAttempt] = useState<EventAttempt | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [name, setName] = useState("");
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    // Duplicated getSession()/onAuthStateChange pattern (no shared hook for
    // this exists yet -- Header.tsx/useSignInHint.ts each do their own copy).
    const applySession = (user: { is_anonymous?: boolean } | null) => {
      setIsAnonymous(user?.is_anonymous ?? true);
    };
    supabase.auth.getSession().then(({ data }) => applySession(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => applySession(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      const pid = await initializeAuth();
      const e = await fetchEvent(slug);
      if (!e) {
        setStatus("not_found");
        return;
      }
      setEvent(e);
      setName(getKnownPlayerName());
      const [board, mine] = await Promise.all([
        fetchEventLeaderboard(e.slug),
        pid ? fetchMyEventAttempt(e.slug, pid) : Promise.resolve(null),
      ]);
      setAttempts(board);
      setMyAttempt(mine);
      fetchVerifiedPlayerIds(board.map((a) => a.player_id)).then(setVerifiedIds);
      setStatus("ready");
    })();
  }, [slug, initializeAuth]);

  useEffect(() => {
    if (!event) return;
    const tick = () => setCountdown(formatCountdown(event.ends_at));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [event]);

  const hasKnownName = Boolean(getKnownPlayerName());
  const hasEnded = event ? Date.now() > new Date(event.ends_at).getTime() : false;
  const topScore = attempts[0]?.score ?? null;
  const myEntry = attempts.find((a) => a.player_id === playerId) ?? myAttempt;
  const myRank = myEntry ? attempts.findIndex((a) => a.player_id === myEntry.player_id) + 1 || null : null;
  const top3 = attempts.slice(0, 3);
  const rest = attempts.slice(3);

  const handlePlay = () => {
    if (!event) return;
    const trimmed = name.trim() || "A music fan";
    saveUsername(trimmed);
    setPlayer(trimmed, 1);
    setCategory(event.playlist_id);
    trackEvent("event_challenge_start", { event_slug: event.slug });
    navigate("/solo/game", {
      state: { event: { slug: event.slug, endsAt: event.ends_at } },
    });
  };

  return (
    <div
      className="min-h-screen text-white antialiased"
      style={{ backgroundColor: "#0b0d12" }}
    >
      <Helmet>
        <title>{event ? `SongIQ x Crackers: ${event.name} | SongIQ` : "Event Challenge | SongIQ"}</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>

      {status === "loading" && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center z-10">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 mx-auto mb-4"
            >
              <Music2 className="w-full h-full text-amber-400" />
            </motion.div>
            <p className="text-xl text-white/80">Loading event...</p>
          </div>
        </div>
      )}

      {status === "not_found" && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center z-10 max-w-md">
            <p className="text-2xl font-bold text-white mb-2">Event not found</p>
            <p className="text-slate-400 mb-6">This event link has expired or doesn't exist.</p>
            <Button
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold"
              size="lg"
              onClick={() => navigate("/")}
            >
              Play SongIQ
            </Button>
          </div>
        </div>
      )}

      {status === "ready" && event && (
        <>
        <main className={cn(!hasEnded && "pb-20 sm:pb-0")}>
          {/* Ticker */}
          <div className="bg-[#0e1117] text-slate-300 text-xs py-2.5 px-4 border-b border-slate-800/80">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] tracking-wider border ${
                  hasEnded
                    ? "bg-slate-800/50 text-slate-400 border-slate-700"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${hasEnded ? "bg-slate-500" : "bg-rose-500 animate-pulse"}`} />
                {hasEnded ? "TOURNAMENT ENDED" : "TOURNAMENT LIVE"}
              </span>
              <div className="flex items-center gap-4 text-xs">
                {!hasEnded && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 font-medium">
                    ⏳ {countdown || "—"} left
                  </span>
                )}
                {event.prize_label && (
                  <span className="text-amber-400 font-semibold hidden sm:inline">🏆 {event.prize_label} Purse</span>
                )}
                <a className="text-slate-400 hover:text-white underline transition-colors hidden md:inline" href="#standings">
                  Arena Standings ↓
                </a>
              </div>
            </div>
          </div>

          {/* Hero / match lobby */}
          <section className="relative pt-12 pb-14 px-4 sm:px-6 lg:px-8 border-b border-slate-800/60" id="match-lobby">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono font-medium mb-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> SongIQ x Crackers • {event.name}
                </div>
                <h1 className="font-display font-black text-4xl sm:text-6xl tracking-tight text-white leading-none mb-3">
                  {event.prize_label ? (
                    <>
                      <span className="mr-3">WIN</span>
                      <span className="text-amber-400">{event.prize_label}</span>
                    </>
                  ) : (
                    event.name
                  )}
                </h1>
                <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto font-normal leading-relaxed">
                  Beat the 10-song gauntlet. Play as many times as you like — only your most recent run is recorded,
                  so play again any time to improve your standing before the clock runs out.
                </p>
              </div>

              <div className="max-w-xl mx-auto">
                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
                  {myEntry ? (
                    <>
                      <div className="rounded-xl p-2.5 sm:p-4 text-center border border-slate-800 bg-[#11141a]">
                        <div className="flex items-center justify-center gap-1.5 mb-1.5">
                          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                            Your Score
                          </span>
                        </div>
                        <span className="font-display font-black text-2xl sm:text-3xl text-amber-300 tracking-tight">
                          {myEntry.score}
                        </span>
                      </div>
                      <div className="rounded-xl p-2.5 sm:p-4 text-center border border-slate-800 bg-[#11141a]">
                        <div className="flex items-center justify-center gap-1.5 mb-1.5">
                          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                            Rank
                          </span>
                        </div>
                        <span className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight">
                          {myRank != null ? `#${myRank}` : "—"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-xl p-2.5 sm:p-4 text-center border border-slate-800 bg-[#11141a]">
                        <div className="flex items-center justify-center gap-1.5 mb-1.5">
                          <span className="text-xs text-slate-400">👥</span>
                          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                            Players
                          </span>
                        </div>
                        <span className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight">
                          {attempts.length}
                        </span>
                      </div>
                      <div className="rounded-xl p-2.5 sm:p-4 text-center border border-slate-800 bg-[#11141a]">
                        <div className="flex items-center justify-center gap-1.5 mb-1.5">
                          <span className="text-xs text-amber-400">⏱️</span>
                          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                            {hasEnded ? "Status" : "Remaining"}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[11px] sm:text-base text-amber-300 whitespace-nowrap">
                          {hasEnded ? "Ended" : countdown || "—"}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="rounded-xl p-2.5 sm:p-4 text-center border border-slate-800 bg-[#11141a]">
                    <div className="flex items-center justify-center gap-1.5 mb-1.5">
                      <span className="text-xs text-amber-400">👑</span>
                      <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                        Top Score
                      </span>
                    </div>
                    <span className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight">
                      {topScore ?? "—"}
                    </span>
                  </div>
                </div>

                <div
                  className={cn(
                    "w-full rounded-2xl p-6 sm:p-7 border border-slate-800 bg-[#11141a]",
                    // Nothing left to show here on mobile once the button
                    // below moves to the sticky bar -- collapse the panel
                    // instead of leaving an empty box with just a lock icon.
                    isAnonymous && !hasEnded && "hidden sm:block"
                  )}
                >
                  {hasEnded ? (
                    <p className="text-center text-sm font-semibold text-slate-400">
                      This tournament has ended — thanks for playing!
                    </p>
                  ) : isAnonymous ? (
                    <div className="flex flex-col items-center gap-3">
                      <Lock className="w-5 h-5 text-slate-500" />
                      <Button
                        className="hidden sm:inline-flex w-full sm:w-auto py-3 px-8 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-display font-bold text-xs uppercase tracking-wider"
                        onClick={openSignInModal}
                      >
                        Sign In to Enter Tournament →
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                      {!hasKnownName && (
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your nickname"
                          aria-label="Your nickname"
                          maxLength={20}
                          className="text-center text-lg bg-[#0c0e12] border-slate-700 text-white"
                          onKeyDown={(e) => e.key === "Enter" && name.trim() && handlePlay()}
                        />
                      )}
                      <Button
                        className="hidden sm:inline-flex w-full py-3 px-8 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-xs uppercase tracking-wider"
                        onClick={handlePlay}
                        disabled={!name.trim()}
                      >
                        <Play className="w-4 h-4 mr-2 fill-current" />
                        {myEntry ? "Play Again" : "Enter the Arena"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Standings */}
          <section className="py-14 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-b border-slate-800/60" id="standings">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-mono font-medium uppercase tracking-widest text-slate-400 bg-slate-900 px-3 py-1 rounded-full mb-3 border border-slate-800">
                  <span className={`w-1.5 h-1.5 rounded-full ${hasEnded ? "bg-slate-500" : "bg-emerald-400 animate-pulse"}`} />
                  {hasEnded ? "FINAL ARENA STANDINGS" : "LIVE ARENA STANDINGS"}
                </div>
                <h2 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight flex items-center gap-2">
                  {event.prize_label ? `${event.prize_label} Championship Standings` : "Championship Standings"} 🏆
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  {event.prize_label ? (
                    <>
                      Only the <strong className="text-white font-semibold">Rank #1 Champion</strong> when the clock
                      runs out walks away with {event.prize_label}.
                    </>
                  ) : (
                    "Live standings for this event."
                  )}
                </p>
              </div>
            </div>

            {top3.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-[#11141a] p-10 text-center text-slate-400 text-sm mb-8">
                No one has played yet — be first!
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-5 mb-8 items-end">
                {top3.map((a, i) => {
                  const isChampion = i === 0;
                  const delta = topScore != null ? topScore - a.score : 0;
                  const isMe = a.player_id === playerId;
                  return (
                    <div
                      key={a.player_id}
                      className={
                        isChampion
                          ? "order-first md:order-none w-full md:w-72 rounded-2xl p-1 bg-gradient-to-b from-amber-400/40 via-amber-500/20 to-transparent"
                          : "w-full sm:w-64"
                      }
                    >
                      <div
                        className={
                          isChampion
                            ? `bg-[#141820] rounded-[15px] p-6 text-center relative border border-amber-400/30 ${isMe ? "ring-2 ring-amber-300" : ""}`
                            : `rounded-2xl p-5 border bg-[#11141a] text-center ${isMe ? "ring-2 ring-amber-300" : "border-slate-800"}`
                        }
                      >
                        {isChampion && event.prize_label && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 text-[10px] font-mono uppercase tracking-widest mb-3">
                            👑 REIGNING {event.prize_label} HOLDER
                          </div>
                        )}
                        <div
                          className={
                            isChampion
                              ? "w-14 h-14 mx-auto mb-2 bg-amber-400/10 border border-amber-400/30 rounded-full flex items-center justify-center text-2xl"
                              : "w-12 h-12 mx-auto mb-2 bg-slate-800/80 rounded-full flex items-center justify-center text-xl border border-slate-700"
                          }
                        >
                          {RANK_BADGE[i]}
                        </div>
                        <span
                          className={
                            isChampion
                              ? "inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-400/10 text-amber-300 uppercase tracking-wider mb-1"
                              : "inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider mb-2 bg-slate-900 text-slate-400 border border-slate-800"
                          }
                        >
                          {RANK_LABEL[i]}
                        </span>
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <PlayerAvatar variant="icon-only" size="sm" name={a.player_name} avatarIndex={1} playerId={a.player_id} />
                          <h3 className={isChampion ? "font-display font-black text-xl text-white" : "font-display font-bold text-lg text-white"}>
                            {a.player_name}
                            {verifiedIds.has(a.player_id) && <VerifiedBadge className="ml-1 inline-block" />}
                          </h3>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono mb-1">
                          {a.play_count} {a.play_count === 1 ? "attempt" : "attempts"}
                        </p>
                        {isChampion ? (
                          event.prize_label && (
                            <div className="flex items-center justify-center gap-1.5 mb-4 mt-2">
                              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-0.5 rounded-full border border-emerald-500/20">
                                💰 In Prize Zone: {event.prize_label}
                              </span>
                            </div>
                          )
                        ) : (
                          <span className="inline-block text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-full mb-4 mt-2">
                            -{delta} PTS from #1
                          </span>
                        )}
                        <div
                          className={
                            isChampion
                              ? "bg-[#0c0e12] rounded-xl p-3 flex justify-around border border-amber-400/20 text-xs"
                              : "bg-[#0c0e12] rounded-xl p-3 flex justify-around border border-slate-800/80 text-xs"
                          }
                        >
                          <div>
                            <span className={isChampion ? "block text-[10px] uppercase font-mono text-amber-300/70" : "block text-[10px] uppercase font-mono text-slate-500"}>
                              Score
                            </span>
                            <span className={isChampion ? "font-display font-black text-xl text-amber-300" : "font-display font-bold text-base text-slate-200"}>
                              {a.score}
                            </span>
                          </div>
                          <div className="border-r border-slate-800" />
                          <div>
                            <span className={isChampion ? "block text-[10px] uppercase font-mono text-amber-300/70" : "block text-[10px] uppercase font-mono text-slate-500"}>
                              Avg Speed
                            </span>
                            <span className={isChampion ? "font-display font-black text-xl text-white" : "font-display font-bold text-base text-slate-200"}>
                              {formatSpeed(a.avg_response_ms)}
                            </span>
                          </div>
                          <div className="border-r border-slate-800" />
                          <div>
                            <span className={isChampion ? "block text-[10px] uppercase font-mono text-amber-300/70" : "block text-[10px] uppercase font-mono text-slate-500"}>
                              Acc.
                            </span>
                            <span className={isChampion ? "font-display font-black text-xl text-emerald-400" : "font-display font-bold text-base text-emerald-400"}>
                              {a.correct_count}/10
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {rest.length > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-[#11141a] overflow-hidden">
                <div className="px-5 py-3.5 bg-[#0e1117] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-display font-bold text-xs sm:text-sm text-white">
                      Tournament Contenders (Ranks 4 – {attempts.length})
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Standings: <strong className="text-emerald-400 font-medium">Live Synced</strong>
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[618px] overflow-y-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="py-3 px-5 text-[11px] font-mono uppercase tracking-wider text-slate-500">Rank</TableHead>
                        <TableHead className="py-3 px-5 text-[11px] font-mono uppercase tracking-wider text-slate-500">Player</TableHead>
                        <TableHead className="py-3 px-5 text-center text-[11px] font-mono uppercase tracking-wider text-slate-500">Score</TableHead>
                        <TableHead className="py-3 px-5 text-center text-[11px] font-mono uppercase tracking-wider text-slate-500">Accuracy</TableHead>
                        <TableHead className="py-3 px-5 text-center text-[11px] font-mono uppercase tracking-wider text-slate-500 whitespace-nowrap">Prize Status</TableHead>
                        <TableHead className="py-3 px-5 text-right text-[11px] font-mono uppercase tracking-wider text-slate-500 whitespace-nowrap">Avg Response</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-800/80 text-xs font-medium text-slate-300">
                      {rest.map((a, i) => {
                        const rank = i + 4;
                        const needsToBeat = topScore != null ? topScore - a.score : 0;
                        const isMe = a.player_id === playerId;
                        return (
                          <TableRow key={a.player_id} className={`border-slate-800/80 hover:bg-slate-800/30 transition ${isMe ? "bg-amber-400/5" : ""}`}>
                            <TableCell className="py-3.5 px-5 font-mono text-slate-400">#{String(rank).padStart(2, "0")}</TableCell>
                            <TableCell className="py-3.5 px-5">
                              <div className="flex items-center gap-2.5">
                                <PlayerAvatar variant="icon-only" size="xs" name={a.player_name} avatarIndex={1} playerId={a.player_id} />
                                <div>
                                  <strong className="block text-white font-medium">
                                    {a.player_name}
                                    {verifiedIds.has(a.player_id) && <VerifiedBadge className="ml-1 inline-block" />}
                                    {isMe && <span className="text-amber-300 text-xs font-normal"> (you)</span>}
                                  </strong>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {a.play_count} {a.play_count === 1 ? "attempt" : "attempts"}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3.5 px-5 text-center font-bold text-amber-300">{a.score}</TableCell>
                            <TableCell className="py-3.5 px-5 text-center text-slate-200 font-mono">{a.correct_count}/10</TableCell>
                            <TableCell className="py-3.5 px-5 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
                                Needs +{needsToBeat} to #1
                              </span>
                            </TableCell>
                            <TableCell className="py-3.5 px-5 text-right font-mono text-slate-400">{formatSpeed(a.avg_response_ms)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {!hasEnded && (
                  <div className="p-4 bg-[#0e1117] border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400">⚡</span>
                      <span className="text-xs text-slate-300 font-medium">
                        Unlimited plays until the clock runs out.
                        {topScore != null && ` Beat ${topScore} to take the lead!`}
                      </span>
                    </div>
                    <a
                      className="px-4 py-2 rounded-lg bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs uppercase tracking-wider transition flex items-center gap-1.5"
                      href="#match-lobby"
                    >
                      Enter Arena Now →
                    </a>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* About SongIQ -- accurate copy, not the design's invented claims */}
          <section className="py-14 bg-[#0b0d12]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-3xl mx-auto mb-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-slate-400 border border-slate-800 text-xs font-mono font-medium mb-3 uppercase tracking-wider">
                  ABOUT SONGIQ
                </div>
                <h2 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight mb-2">What is SongIQ?</h2>
                <p className="text-slate-400 text-sm sm:text-base font-normal leading-relaxed">
                  A music quiz game where you race the clock to name the song or artist from a real audio clip.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
                <div className="rounded-2xl p-6 border border-slate-800 bg-[#11141a]">
                  <div className="w-11 h-11 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 flex items-center justify-center mb-4">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-white mb-2">Real audio clips</h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Every round plays a short real preview of a track. Pick the right song or artist from 4 choices.
                  </p>
                </div>
                <div className="rounded-2xl p-6 border border-slate-800 bg-[#11141a]">
                  <div className="w-11 h-11 rounded-xl bg-slate-800/80 border border-slate-700 text-amber-400 flex items-center justify-center mb-4">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-white mb-2">Speed = higher score</h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Every correct answer is worth 100 points, plus up to 100 more the faster you lock it in — up to
                    200 points a round.
                  </p>
                </div>
                <div className="rounded-2xl p-6 border border-slate-800 bg-[#11141a]">
                  <div className="w-11 h-11 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 flex items-center justify-center mb-4">
                    <Repeat className="w-5 h-5" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-white mb-2">Unlimited replays</h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Never the same 10 songs twice — every attempt shuffles a fresh set. Play as many times as you
                    like; only your most recent run is recorded on the standings.
                  </p>
                </div>
              </div>
              {!hasEnded && (
                <div className="rounded-2xl p-6 sm:p-8 border border-slate-800 bg-[#11141a] text-white flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="text-center sm:text-left">
                    <h3 className="font-display font-bold text-xl sm:text-2xl mb-1 text-white">Ready to test your music IQ?</h3>
                    <p className="text-xs sm:text-sm text-slate-400">Jump in right now from your phone. No app install needed.</p>
                  </div>
                  <button
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                    onClick={() => navigate("/")}
                  >
                    Explore SongIQ
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>

        {/* Sticky mobile CTA -- the hero's own Sign In / Play button is
            hidden on mobile (see above) in favor of this, so it's always
            reachable without scrolling back up. */}
        {!hasEnded && (
          <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-[#0e1117]/95 backdrop-blur-xl p-3">
            {isAnonymous ? (
              <Button
                className="w-full py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-display font-bold text-xs uppercase tracking-wider"
                onClick={openSignInModal}
              >
                Sign In to Enter Tournament →
              </Button>
            ) : (
              <Button
                className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-xs uppercase tracking-wider"
                onClick={handlePlay}
                disabled={!name.trim() && !hasKnownName}
              >
                <Play className="w-4 h-4 mr-2 fill-current" />
                {myEntry ? "Play Again" : "Enter the Arena"}
              </Button>
            )}
          </div>
        )}
        </>
      )}
    </div>
  );
}
