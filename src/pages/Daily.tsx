import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Play, CalendarDays, Flame, Share2 } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { DailyReminderButton } from "@/components/DailyReminderButton";
import { DailyPodium } from "@/components/DailyPodium";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useGameStore } from "@/lib/gameStore";
import { getKnownPlayerName, saveUsername, type Challenge } from "@/lib/challenges";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";
import { shareResult } from "@/lib/shareCard";
import { trackEvent } from "@/lib/analytics";
import { useSignInHint } from "@/hooks/useSignInHint";
import {
  fetchTodayChallenge,
  fetchDailyAttempts,
  fetchMyDailyAttempt,
  fetchMyDailyRank,
  fetchDailyStatsLeaderboard,
  fetchMyDailyStats,
  isStreakActive,
  isStreakAtRisk,
  DAILY_URL,
  type DailyChallenge,
  type DailyAttempt,
  type DailyStats,
  type DailyLeaderboardStats,
} from "@/lib/daily";

// Day boundary is Lagos midnight (UTC+1), i.e. 23:00 UTC -- same convention
// used throughout the app (lagosToday = new Date(now + 1h) sliced to a date).
function getNextDailyResetUTC(from: Date): Date {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 0, 0, 0));
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
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

export default function Daily() {
  const navigate = useNavigate();
  const { initializeAuth, playerId, setPlayer, openSignInModal } = useGameStore();
  const signInHint = useSignInHint();

  const [status, setStatus] = useState<"loading" | "ready" | "none">("loading");
  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [attempts, setAttempts] = useState<DailyAttempt[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [allTime, setAllTime] = useState<DailyLeaderboardStats[]>([]);
  const [myStats, setMyStats] = useState<DailyStats | null>(null);
  const [myAttempt, setMyAttempt] = useState<DailyAttempt | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [tab, setTab] = useState<"today" | "alltime">("today");
  const [streakSortBy, setStreakSortBy] = useState<"streak" | "score">("streak");
  const [name, setName] = useState("");
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [dailyCountdown, setDailyCountdown] = useState("");

  useEffect(() => {
    (async () => {
      const pid = await initializeAuth();
      const challenge = await fetchTodayChallenge();
      if (!challenge) {
        setStatus("none");
        return;
      }
      setDaily(challenge);
      setName(getKnownPlayerName());
      const [{ attempts: rows, total }, board, mine, attempt] = await Promise.all([
        fetchDailyAttempts(challenge.challenge_date),
        fetchDailyStatsLeaderboard(),
        pid ? fetchMyDailyStats(pid) : Promise.resolve(null),
        // Direct lookup — never rely on the top-50 board slice to know
        // whether this player already played (they may rank below it)
        pid ? fetchMyDailyAttempt(challenge.challenge_date, pid) : Promise.resolve(null),
      ]);
      setAttempts(rows);
      setTotalPlayers(total);
      setAllTime(board);
      setMyStats(mine);
      setMyAttempt(attempt);
      fetchVerifiedPlayerIds([
        ...rows.map((r) => r.player_id),
        ...board.map((b) => b.player_id),
      ]).then(setVerifiedIds);
      if (attempt) {
        const { rank } = await fetchMyDailyRank(challenge.challenge_date, attempt.score);
        setMyRank(rank);
      }
      setStatus("ready");
    })();
  }, [initializeAuth]);

  // Ticks once a second while today's challenge is shown, so "Time Remaining" stays live.
  useEffect(() => {
    if (!daily) return;
    const tick = () => setDailyCountdown(formatCountdown(getNextDailyResetUTC(new Date()).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [daily]);

  const myStreak = isStreakActive(myStats) ? myStats?.current_streak ?? 0 : 0;
  const myStreakAtRisk = isStreakAtRisk(myStats);
  // Skip asking for a nickname when one is already known (profile or the
  // multiplayer cookie) -- computed fresh each render, not from `name`
  // state, so there's no flash of the input before the mount effect fills it.
  const hasKnownName = Boolean(getKnownPlayerName());
  const topScore = attempts[0]?.score ?? null;

  // allTime already arrives sorted by streak (the default); only re-sort
  // client-side when the player switches to Total Score, to avoid a
  // round-trip for what's just a re-ordering of the same 50 rows.
  const sortedAllTime =
    streakSortBy === "score"
      ? [...allTime].sort((a, b) => b.total_score - a.total_score)
      : allTime;

  const handlePlay = () => {
    if (!daily) return;
    const trimmed = name.trim() || "A music fan";
    saveUsername(trimmed);
    setPlayer(trimmed, 1);
    // Reuse the solo engine's challenge mode with the daily plan
    const challenge: Challenge = {
      code: `daily-${daily.challenge_date}`,
      creator_name: "SongIQ",
      creator_score: 0,
      category_name: daily.category_name,
      time_per_round: daily.time_per_round,
      plan: daily.plan,
    };
    trackEvent("daily_challenge_start", {
      daily_number: daily.number,
      daily_date: daily.challenge_date,
      category_name: daily.category_name,
    });
    navigate("/solo/game", {
      state: { challenge, daily: { date: daily.challenge_date, number: daily.number } },
    });
  };

  const handleChallengeAFriend = async () => {
    if (!daily) return;
    trackEvent("daily_invite_share", { daily_number: daily.number });
    const text = [
      `🎵 SongIQ Daily #${daily.number} — ${daily.category_name}`,
      `Same 10 songs for everyone, once a day. Think you can beat me? 👉 ${DAILY_URL}`,
    ].join("\n");
    await shareResult(text);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>Daily Music Challenge | SongIQ</title>
        <meta name="description" content="One music quiz a day — the same 10 songs for everyone. Play today's SongIQ Daily Challenge, keep your streak alive and climb the leaderboard." />
        <link rel="canonical" href="https://songiq.io/daily" />
        <meta property="og:title" content="Daily Music Challenge | SongIQ" />
        <meta property="og:description" content="Same 10 songs for everyone, once a day. Can you top today's leaderboard?" />
        <meta property="og:url" content="https://songiq.io/daily" />
      </Helmet>
      <Starfield />
      <Header />

      {status === "loading" && (
        <div className="min-h-screen flex items-center justify-center pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+100px)]">
          <div className="text-center z-10">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 mx-auto mb-4"
            >
              <Music2 className="w-full h-full text-gold" />
            </motion.div>
            <p className="text-xl text-foreground/80">Loading today's challenge...</p>
          </div>
        </div>
      )}

      {status === "none" && (
        <div className="min-h-screen flex items-center justify-center p-4 pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+100px)]">
          <div className="text-center z-10 max-w-md">
            <CalendarDays className="w-14 h-14 text-gold mx-auto mb-4" />
            <p className="text-2xl font-bold text-foreground mb-2">No challenge yet today</p>
            <p className="text-muted-foreground mb-6">
              Today's challenge is being prepared — check back in a few minutes!
            </p>
            <Button variant="gold" size="lg" onClick={() => navigate("/")}>
              Back to SongIQ
            </Button>
          </div>
        </div>
      )}

      {status === "ready" && daily && (
        <main className="relative z-10 max-w-[1200px] mx-auto px-4 pb-32 pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+100px)]">
          {/* Hero — sits directly on the page, not in a panel */}
          <motion.div
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center mb-12"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-[11px] font-bold uppercase tracking-[0.15em] text-primary mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Today's Challenge Active · #{daily.number}
            </span>

            <h1 className="text-[2rem] md:text-[2.57rem] leading-tight font-bold text-foreground mb-2">
              {myAttempt ? "You played today's challenge!" : "You haven't played today's challenge yet!"}
            </h1>
            <p className="text-muted-foreground mb-6">
              <span className="block text-[20px] text-primary font-semibold mb-2">{daily.category_name}</span>
              {daily.plan.length} Songs · {daily.time_per_round}s Each · One attempt counts towards the leaderboard.
            </p>

            {myAttempt ? null : (
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
                  Play Today's Challenge
                </Button>
              </div>
            )}

            {myStreak > 0 && signInHint.show && (
              <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-2">
                <span>Sign in to protect your {myStreak}-day streak</span>
                <button onClick={openSignInModal} className="text-primary font-semibold hover:underline">
                  Sign in
                </button>
                <span>·</span>
                <button onClick={signInHint.dismiss} className="hover:text-foreground">
                  Not now
                </button>
              </p>
            )}
          </motion.div>

          {/* Stat row — individual panels; switches once you've played today */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12 max-w-[800px] mx-auto">
            {myAttempt ? (
              <>
                <StatTile label="Your Score" value={myAttempt.score} valueClassName="text-gold" />
                <StatTile label="Current Rank" value={myRank != null ? `#${myRank}` : "—"} />
                <StatTile label="Top Score" value={topScore ?? "—"} />
              </>
            ) : (
              <>
                <StatTile label="Players Today" value={totalPlayers} />
                <StatTile label="Top Score to Beat" value={topScore ?? "—"} />
                <StatTile label="Time Remaining" value={dailyCountdown || "—"} />
              </>
            )}
            <StatTile
              label="Current Streak"
              value={myStreak > 0 ? `${myStreak}-Day${myStreakAtRisk ? " (At Risk)" : ""}` : "—"}
              valueClassName={myStreakAtRisk ? "text-destructive" : "text-gold"}
            />
          </div>

          <DailyReminderButton variant="card" className="mb-12 max-w-[800px] mx-auto" />

          {/* Podium */}
          <div className="mb-12">
            <DailyPodium
              attempts={attempts.slice(0, 3)}
              currentPlayerId={playerId}
              verifiedIds={verifiedIds}
              totalRounds={daily.plan.length}
            />
          </div>

          <div className="raised-panel p-3 text-left">
            {/* Leaderboard tabs — full width & wrapping on mobile so they
                never overflow; compact, top-left, single-line on desktop */}
            <div className="flex w-full md:inline-flex md:w-auto rounded-xl bg-card/60 border border-border p-1 mb-3">
              <button
                onClick={() => setTab("today")}
                className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.15em] transition-all leading-tight md:whitespace-nowrap ${
                  tab === "today"
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Today's Challenge
              </button>
              <button
                onClick={() => setTab("alltime")}
                className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.15em] transition-all leading-tight md:whitespace-nowrap ${
                  tab === "alltime"
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Streaks & Records
              </button>
            </div>

            {/* Header (48px) + 10 rows (57px each) -- top 10 visible before it scrolls */}
            <div className="max-h-[618px] overflow-y-auto overflow-x-auto">
            {tab === "today" ? (
              attempts.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No one has played yet — be first!
                </p>
              ) : (
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="w-10 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">#</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Player</TableHead>
                      <TableHead className="text-right text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Score</TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-primary whitespace-nowrap">Accuracy</TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-primary whitespace-nowrap">Avg Response</TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-primary whitespace-nowrap">Completed At</TableHead>
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
                          {a.correct_count}/{daily.plan.length}
                        </TableCell>
                        <TableCell className="py-3 text-center text-muted-foreground whitespace-nowrap">
                          {formatSpeed(a.avg_response_ms)}
                        </TableCell>
                        <TableCell className="py-3 text-center text-muted-foreground whitespace-nowrap">
                          {new Date(a.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : allTime.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                Streaks appear once people start playing daily.
              </p>
            ) : (
              <>
                <div className="flex justify-end gap-1.5 mb-2">
                  <button
                    onClick={() => setStreakSortBy("streak")}
                    className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-colors ${
                      streakSortBy === "streak"
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Streak
                  </button>
                  <button
                    onClick={() => setStreakSortBy("score")}
                    className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-colors ${
                      streakSortBy === "score"
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Total Score
                  </button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="w-10 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">#</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Name</TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Streak</TableHead>
                      <TableHead className="text-right text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAllTime.map((s, i) => (
                      <TableRow
                        key={s.player_id}
                        className={`border-border/30 ${
                          s.player_id === playerId ? "bg-primary/10" : i % 2 === 0 ? "bg-card/40" : ""
                        }`}
                      >
                        <TableCell className="py-3 font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="py-3">
                          <span className="flex items-center gap-2.5 min-w-0">
                            <PlayerAvatar variant="icon-only" size="xs" name={s.player_name} avatarIndex={1} playerId={s.player_id} />
                            <span className="truncate font-bold text-foreground">
                              {s.player_name}
                              {verifiedIds.has(s.player_id) && <VerifiedBadge className="ml-1" />}
                              {s.player_id === playerId && <span className="text-primary text-xs font-normal"> (you)</span>}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          {s.effective_streak > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                              🔥 {s.effective_streak}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right font-bold text-gold text-[1.1rem]">{s.total_score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            </div>
          </div>
        </main>
      )}

      {/* Sticky status bar */}
      {status === "ready" && daily && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl">
          <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                {myAttempt ? (
                  <>Your status: <span className="text-gold">#{myRank} of {totalPlayers}</span></>
                ) : (
                  <>Your status: <span className="text-muted-foreground">You are currently not on the board</span></>
                )}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                {myAttempt
                  ? `${myAttempt.correct_count}/${daily.plan.length} songs completed`
                  : `Complete today's challenge to enter the leaderboard — 0/${daily.plan.length} songs`}
                {myStreakAtRisk && (
                  <span className="text-destructive font-semibold flex items-center gap-1">
                    <Flame className="w-3 h-3" /> {myStreak}-Day Streak at Risk
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleChallengeAFriend}>
                <Share2 className="w-4 h-4 mr-1.5" />
                Challenge a Friend
              </Button>
              {!myAttempt && (
                <Button variant="gold" size="sm" onClick={handlePlay} disabled={!name.trim() && !hasKnownName}>
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  Play Now
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
