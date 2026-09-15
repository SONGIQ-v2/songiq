import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Play, PartyPopper, Lock } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DailyPodium } from "@/components/DailyPodium";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { getKnownPlayerName, saveUsername } from "@/lib/challenges";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";
import { trackEvent } from "@/lib/analytics";
import { fetchEvent, fetchEventLeaderboard, fetchMyEventAttempt, type Event, type EventAttempt } from "@/lib/events";

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

function StatTile({
  label,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="raised-panel px-3 py-3 flex flex-col items-center text-center gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold tabular-nums truncate max-w-full ${valueClassName}`}>{value}</span>
    </div>
  );
}

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
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>{event ? `${event.name} — SongIQ` : "Event Challenge | SongIQ"}</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      {event?.background_image_url ? (
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: `url(${event.background_image_url})` }}
        />
      ) : (
        <Starfield />
      )}
      <Header />

      {status === "loading" && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center z-10">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 mx-auto mb-4"
            >
              <Music2 className="w-full h-full text-gold" />
            </motion.div>
            <p className="text-xl text-foreground/80">Loading event...</p>
          </div>
        </div>
      )}

      {status === "not_found" && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center z-10 max-w-md">
            <p className="text-2xl font-bold text-foreground mb-2">Event not found</p>
            <p className="text-muted-foreground mb-6">This event link has expired or doesn't exist.</p>
            <Button variant="gold" size="lg" onClick={() => navigate("/")}>
              Play SongIQ
            </Button>
          </div>
        </div>
      )}

      {status === "ready" && event && (
        <main className="relative z-10 max-w-[1200px] mx-auto px-4 pb-16 pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+100px)]">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-[11px] font-bold uppercase tracking-[0.15em] text-primary mb-4">
              <PartyPopper className="w-3 h-3" />
              Event Challenge
            </span>
            <h1 className="text-[2rem] md:text-[2.57rem] leading-tight font-bold text-foreground mb-2">
              {event.name}
            </h1>
            <p className="text-muted-foreground mb-6">
              Play as many times as you like — only your last run counts.
            </p>

            {hasEnded ? (
              <p className="text-sm font-semibold text-muted-foreground">Event ended</p>
            ) : isAnonymous ? (
              <div className="max-w-sm mx-auto raised-panel p-5">
                <Lock className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-sm text-foreground/80 mb-3">Sign in to play this event challenge.</p>
                <Button variant="gold" size="lg" className="w-full" onClick={openSignInModal}>
                  Sign in to play
                </Button>
              </div>
            ) : (
              <div className="max-w-sm mx-auto">
                {!hasKnownName && (
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your nickname"
                    aria-label="Your nickname"
                    maxLength={20}
                    className="text-center text-lg mb-3"
                    onKeyDown={(e) => e.key === "Enter" && name.trim() && handlePlay()}
                  />
                )}
                <Button variant="gold" size="lg" className="w-full" onClick={handlePlay} disabled={!name.trim()}>
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  {myEntry ? "Play Again" : "Play Now"}
                </Button>
              </div>
            )}
          </div>

          {/* Stat row — individual panels */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-12 max-w-[800px] mx-auto">
            {myEntry ? (
              <>
                <StatTile label="Your Score" value={myEntry.score} valueClassName="text-gold" />
                <StatTile label="Current Rank" value={myRank != null ? `#${myRank}` : "—"} />
              </>
            ) : (
              <>
                <StatTile label="Total Players" value={attempts.length} />
                <StatTile label={hasEnded ? "Ended" : "Time Remaining"} value={hasEnded ? "—" : countdown || "—"} />
              </>
            )}
            <StatTile label="Top Score" value={topScore ?? "—"} />
          </div>

          {/* Podium */}
          <div className="mb-12">
            <DailyPodium
              attempts={attempts.slice(0, 3)}
              currentPlayerId={playerId}
              verifiedIds={verifiedIds}
              totalRounds={10}
            />
          </div>

          {/* Leaderboard table */}
          <div className="raised-panel p-3 text-left">
            <div className="max-h-[618px] overflow-y-auto overflow-x-auto">
              {attempts.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No one has played yet — be first!</p>
              ) : (
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="w-10 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">#</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Player</TableHead>
                      <TableHead className="text-right text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Score</TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-primary whitespace-nowrap">Accuracy</TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-primary whitespace-nowrap">Avg Response</TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-primary whitespace-nowrap">Last Played</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attempts.map((a, i) => (
                      <TableRow
                        key={a.player_id}
                        className={`border-border/30 ${
                          a.player_id === playerId ? "bg-primary/10" : i % 2 === 0 ? "bg-card/40" : ""
                        }`}
                      >
                        <TableCell className="py-3 font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="py-3">
                          <span className="flex items-center gap-2.5 min-w-0">
                            <PlayerAvatar variant="icon-only" size="xs" name={a.player_name} avatarIndex={1} playerId={a.player_id} />
                            <span className="truncate font-bold text-foreground">
                              {a.player_name}
                              {verifiedIds.has(a.player_id) && <VerifiedBadge className="ml-1" />}
                              {a.player_id === playerId && <span className="text-primary text-xs font-normal"> (you)</span>}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-right font-bold text-gold text-[1.1rem]">{a.score}</TableCell>
                        <TableCell className="py-3 text-center text-muted-foreground whitespace-nowrap">
                          {a.correct_count}/10
                        </TableCell>
                        <TableCell className="py-3 text-center text-muted-foreground whitespace-nowrap">
                          {formatSpeed(a.avg_response_ms)}
                        </TableCell>
                        <TableCell className="py-3 text-center text-muted-foreground whitespace-nowrap">
                          {new Date(a.updated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
