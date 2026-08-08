import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Play, CalendarDays, Flame, Trophy, Hash, Clock } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import { DailyReminderButton } from "@/components/DailyReminderButton";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import songiqLogo from "@/assets/songiq-logo.png";
import { useGameStore } from "@/lib/gameStore";
import { getSavedUsername, saveUsername, type Challenge } from "@/lib/challenges";
import { trackEvent } from "@/lib/analytics";
import {
  fetchTodayChallenge,
  fetchDailyAttempts,
  fetchMyDailyAttempt,
  fetchMyDailyRank,
  fetchDailyStatsLeaderboard,
  fetchMyDailyStats,
  isStreakActive,
  type DailyChallenge,
  type DailyAttempt,
  type DailyStats,
  type DailyLeaderboardStats,
} from "@/lib/daily";

export default function Daily() {
  const navigate = useNavigate();
  const { initializeAuth, playerId, setPlayer } = useGameStore();

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

  useEffect(() => {
    (async () => {
      const pid = await initializeAuth();
      const challenge = await fetchTodayChallenge();
      if (!challenge) {
        setStatus("none");
        return;
      }
      setDaily(challenge);
      setName(getSavedUsername());
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
      if (attempt) {
        const { rank } = await fetchMyDailyRank(challenge.challenge_date, attempt.score);
        setMyRank(rank);
      }
      setStatus("ready");
    })();
  }, [initializeAuth]);

  const myStreak = isStreakActive(myStats) ? myStats?.current_streak ?? 0 : 0;

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

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      <Helmet>
        <title>Daily Music Challenge | SongIQ</title>
        <meta name="description" content="One music quiz a day — the same 10 songs for everyone. Play today's SongIQ Daily Challenge, keep your streak alive and climb the leaderboard." />
        <link rel="canonical" href="https://songiq.io/daily" />
        <meta property="og:title" content="Daily Music Challenge | SongIQ" />
        <meta property="og:description" content="Same 10 songs for everyone, once a day. Can you top today's leaderboard?" />
        <meta property="og:url" content="https://songiq.io/daily" />
      </Helmet>
      <Starfield />

      {status === "loading" && (
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
      )}

      {status === "none" && (
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
      )}

      {status === "ready" && daily && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="raised-panel p-6 md:p-8 max-w-lg w-full text-center z-10 my-8"
        >
          <Link to="/" className="inline-block mb-4">
            <img src={songiqLogo} alt="SongIQ — Music Trivia Game" className="h-10 mx-auto" />
          </Link>

          <h1 className="text-2xl font-bold text-foreground mb-1">Daily Challenge #{daily.number}</h1>
          <p className="text-muted-foreground mb-4">{daily.category_name}</p>

          <div className="flex justify-center gap-5 mb-5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-primary" />
              {daily.plan.length} songs
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" />
              {daily.time_per_round}s each
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-primary" />
              {totalPlayers} played
            </span>
          </div>

          {myStreak > 0 && (
            <p className="mb-4 font-semibold text-gold flex items-center justify-center gap-1.5">
              <Flame className="w-5 h-5" /> {myStreak}-day streak
            </p>
          )}

          {myAttempt ? (
            <div className="bg-background/50 rounded-xl p-4 mb-5">
              <p className="text-muted-foreground text-sm mb-1">You played today</p>
              <p className="text-4xl font-bold text-gold">{myAttempt.score}</p>
              <p className="text-foreground/70 mt-1">
                #{myRank} of {totalPlayers} · {myAttempt.correct_count}/{daily.plan.length} correct
              </p>
              <p className="text-muted-foreground text-xs mt-2">Next challenge at midnight (GMT)</p>
              <DailyReminderButton className="mt-3" />
            </div>
          ) : (
            <div className="mb-5">
              <p className="text-foreground/80 font-semibold mb-3">
                Same songs for everyone. One attempt — make it count.
              </p>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your nickname"
                aria-label="Your nickname"
                maxLength={20}
                className="text-center text-lg mb-3"
                onKeyDown={(e) => e.key === "Enter" && name.trim() && handlePlay()}
              />
              <Button
                variant="gold"
                size="lg"
                className="w-full"
                onClick={handlePlay}
                disabled={!name.trim()}
              >
                <Play className="w-5 h-5 mr-2" />
                Play Today's Challenge
              </Button>
            </div>
          )}

          {/* Leaderboard tabs — same filled-strip style as the global leaderboard */}
          <div className="flex rounded-xl bg-card/60 border border-border p-1 mb-3">
            <button
              onClick={() => setTab("today")}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-[0.15em] transition-all ${
                tab === "today"
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTab("alltime")}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-[0.15em] transition-all ${
                tab === "alltime"
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Streaks
            </button>
          </div>

          <div className="bg-background/50 rounded-xl p-3 text-left max-h-72 overflow-y-auto">
            {tab === "today" ? (
              attempts.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No one has played yet — be first!
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="w-10 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">#</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Name</TableHead>
                      <TableHead className="text-right text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Score</TableHead>
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
                              {a.player_id === playerId && <span className="text-primary text-xs font-normal"> (you)</span>}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-right font-bold text-gold text-[1.1rem]">{a.score}</TableCell>
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

          <Button variant="outline" size="lg" className="w-full mt-5" onClick={() => navigate("/")}>
            Return to Home
          </Button>
        </motion.div>
      )}
    </div>
  );
}
