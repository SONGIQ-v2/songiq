import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { ArrowLeft, Music2 } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { DailyPodium } from "@/components/DailyPodium";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useGameStore } from "@/lib/gameStore";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";
import {
  fetchChallenge,
  fetchChallengeAttempts,
  fetchMyChallengeAttempt,
  type Challenge,
  type ChallengeAttempt,
} from "@/lib/challenges";

interface BoardAttempt {
  player_id: string;
  player_name: string;
  score: number;
  correct_count: number | null;
  avg_response_ms: number | null;
  created_at: string | null;
  isCreator: boolean;
}

function formatSpeed(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCompletedAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChallengeBoard() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { initializeAuth, playerId } = useGameStore();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [attempts, setAttempts] = useState<ChallengeAttempt[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      await initializeAuth();
      const c = code ? await fetchChallenge(code) : null;
      if (!c) {
        setStatus("not_found");
        return;
      }
      setChallenge(c);
      const board = await fetchChallengeAttempts(c.code);
      setAttempts(board);
      setStatus("ready");
      fetchVerifiedPlayerIds([c.creator_id, ...board.map((a) => a.player_id)]).then(setVerifiedIds);
    })();
  }, [code, initializeAuth]);

  // Creator's score lives directly on `challenges` -- they have no
  // challenge_attempts row, so accuracy/speed/completed-at aren't known for
  // them (rendered as "—"). Folded into one sorted list, same as the
  // compact Challenge.tsx page does.
  const board: BoardAttempt[] = challenge
    ? [
        {
          player_id: challenge.creator_id ?? `creator-${challenge.code}`,
          player_name: challenge.creator_name,
          score: challenge.creator_score,
          correct_count: null,
          avg_response_ms: null,
          created_at: null,
          isCreator: true,
        },
        ...attempts.map((a) => ({
          player_id: a.player_id,
          player_name: a.player_name,
          score: a.score,
          correct_count: a.correct_count,
          avg_response_ms: a.avg_response_ms,
          created_at: a.created_at,
          isCreator: false,
        })),
      ].sort((a, b) => b.score - a.score)
    : [];

  const isCreator = !!challenge?.creator_id && challenge.creator_id === playerId;
  const myEntry = board.find((e) => e.player_id === playerId);
  const myRank = myEntry ? board.indexOf(myEntry) + 1 : null;
  const hasPlayed = isCreator || !!myEntry;
  const topScore = board[0]?.score ?? null;
  const totalPlayers = board.length;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>Full Leaderboard — Music Challenge | SongIQ</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <Starfield />
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
            <p className="text-xl text-foreground/80">Loading challenge...</p>
          </div>
        </div>
      )}

      {status === "not_found" && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center z-10 max-w-md">
            <p className="text-2xl font-bold text-foreground mb-2">Challenge not found</p>
            <p className="text-muted-foreground mb-6">This challenge link has expired or doesn't exist.</p>
            <Button variant="gold" size="lg" onClick={() => navigate("/")}>
              Play SongIQ
            </Button>
          </div>
        </div>
      )}

      {status === "ready" && challenge && (
        <main className="relative z-10 max-w-[1200px] mx-auto px-4 pb-16 pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+100px)]">
          <Link
            to={`/c/${challenge.code}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Challenge
          </Link>

          <div className="text-center mb-12">
            <h1 className="text-[2rem] md:text-[2.57rem] leading-tight font-bold text-foreground mb-2">
              Full Leaderboard
            </h1>
            <p className="text-muted-foreground">
              <span className="block text-[20px] text-primary font-semibold mb-2">{challenge.category_name}</span>
              Same songs, same options — first attempt counts for everyone.
            </p>
          </div>

          {/* Stat row — individual panels */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12 max-w-[800px] mx-auto">
            {hasPlayed ? (
              <>
                <div className="raised-panel px-3 py-3 flex flex-col items-center text-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Your Score</span>
                  <span className="text-lg font-bold tabular-nums text-gold">{myEntry?.score ?? challenge.creator_score}</span>
                </div>
                <div className="raised-panel px-3 py-3 flex flex-col items-center text-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Current Rank</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{myRank != null ? `#${myRank}` : "—"}</span>
                </div>
              </>
            ) : (
              <>
                <div className="raised-panel px-3 py-3 flex flex-col items-center text-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Songs</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{challenge.plan.length}</span>
                </div>
                <div className="raised-panel px-3 py-3 flex flex-col items-center text-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Time per Round</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{challenge.time_per_round}s</span>
                </div>
              </>
            )}
            <div className="raised-panel px-3 py-3 flex flex-col items-center text-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Top Score</span>
              <span className="text-lg font-bold tabular-nums text-foreground">{topScore ?? "—"}</span>
            </div>
            <div className="raised-panel px-3 py-3 flex flex-col items-center text-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Total Players</span>
              <span className="text-lg font-bold tabular-nums text-foreground">{totalPlayers}</span>
            </div>
          </div>

          {/* Podium */}
          <div className="mb-12">
            <DailyPodium
              attempts={board.slice(0, 3)}
              currentPlayerId={playerId}
              verifiedIds={verifiedIds}
              totalRounds={challenge.plan.length}
            />
          </div>

          {/* Leaderboard table */}
          <div className="raised-panel p-3 text-left">
            <div className="max-h-[618px] overflow-y-auto overflow-x-auto">
              {board.length === 0 ? (
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
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-primary whitespace-nowrap">Completed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {board.map((a, i) => (
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
                              {a.isCreator && <span className="text-muted-foreground text-xs font-normal"> (creator)</span>}
                              {a.player_id === playerId && <span className="text-primary text-xs font-normal"> (you)</span>}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-right font-bold text-gold text-[1.1rem]">{a.score}</TableCell>
                        <TableCell className="py-3 text-center text-muted-foreground whitespace-nowrap">
                          {a.correct_count != null ? `${a.correct_count}/${challenge.plan.length}` : "—"}
                        </TableCell>
                        <TableCell className="py-3 text-center text-muted-foreground whitespace-nowrap">
                          {formatSpeed(a.avg_response_ms)}
                        </TableCell>
                        <TableCell className="py-3 text-center text-muted-foreground whitespace-nowrap">
                          {formatCompletedAt(a.created_at)}
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
