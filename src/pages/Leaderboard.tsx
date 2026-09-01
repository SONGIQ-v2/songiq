import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, HelpCircle, Medal, X } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { useSignInHint } from "@/hooks/useSignInHint";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGameStore } from "@/lib/gameStore";
import {
  fetchGlobalLeaderboard,
  formatMinutes,
  rangeStartLabel,
  type GlobalLeaderboardRow,
  type LeaderboardRange,
  type LeaderboardSort,
} from "@/lib/leaderboard";

const RANGES: { key: LeaderboardRange; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "all", label: "All time" },
];

export default function Leaderboard() {
  const { playerId, initializeAuth, openSignInModal } = useGameStore();
  const signInHint = useSignInHint();
  const [range, setRange] = useState<LeaderboardRange>("week");
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [sort, setSort] = useState<LeaderboardSort>("points");
  const [rows, setRows] = useState<GlobalLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchGlobalLeaderboard(range, sort, playerId);
        if (!cancelled) setRows(data);
        fetchVerifiedPlayerIds(data.map((r) => r.player_id)).then((ids) => {
          if (!cancelled) setVerifiedIds(ids);
        });
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
        if (!cancelled) setError("Couldn't load the leaderboard. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, sort, playerId]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>Global Leaderboard | SongIQ</title>
        <meta
          name="description"
          content="SongIQ's global leaderboard: top players by time played and Points across every game mode."
        />
      </Helmet>
      <Starfield />
      <Header />

      <main className="relative z-10 pt-[var(--header-height)] pb-12 px-4">
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-[1200px] mx-auto text-center mb-6"
        >
          <h1 className="glow-heading mb-1">Global Leaderboard</h1>
          <p className="text-muted-foreground text-sm">
            Every mode counts: solo, daily, challenges & multiplayer
          </p>
        </motion.div>

        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-2xl mx-auto"
        >
          <AnimatePresence>
            {signInHint.show && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-gold/10 border border-gold/30 overflow-hidden"
              >
                <span className="flex-1 text-sm text-foreground/90">
                  Sign in with Google to save your Points and rank across devices.
                </span>
                <Button variant="gold" size="sm" onClick={openSignInModal} className="shrink-0">
                  Sign in
                </Button>
                <button
                  onClick={signInHint.dismiss}
                  aria-label="Dismiss"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Range tabs — filled active block on a dark strip, each labeled
              with when its window starts */}
          <div className="flex rounded-xl bg-card/60 border border-border p-1 mb-4">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`flex-1 py-2 rounded-lg transition-all ${
                  range === r.key
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="block text-xs font-bold uppercase tracking-[0.15em]">{r.label}</span>
                {r.key !== "all" && (
                  <span
                    className={`block text-[10px] font-normal ${
                      range === r.key ? "text-primary-foreground/75" : "text-muted-foreground"
                    }`}
                  >
                    {rangeStartLabel(r.key)}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="raised-panel p-4 md:p-6">
            {/* How it works + sort toggle */}
            <div className="flex items-center justify-between gap-1.5 mb-3">
              <button
                onClick={() => setShowHowItWorks(true)}
                className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" /> How it works
              </button>
              <div className="flex gap-1.5">
              <button
                onClick={() => setSort("points")}
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1 ${
                  sort === "points" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Medal className="w-3.5 h-3.5" /> Points
              </button>
              <button
                onClick={() => setSort("time")}
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1 ${
                  sort === "time" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> Time played
              </button>
              </div>
            </div>

            {loading ? (
              <p className="text-muted-foreground text-sm text-center py-10">Loading leaderboard…</p>
            ) : error ? (
              <p className="text-muted-foreground text-sm text-center py-10">{error}</p>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">
                No games recorded yet. Play a round and claim the top spot!
              </p>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="w-10 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">#</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Name</TableHead>
                      <TableHead className="text-right text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Points</TableHead>
                      <TableHead className="text-center whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Daily streak</TableHead>
                      <TableHead className="text-right whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Minutes played</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow
                        key={row.player_id}
                        className={`border-border/30 ${
                          row.player_id === playerId
                            ? "bg-primary/10"
                            : i % 2 === 0
                            ? "bg-card/40"
                            : undefined
                        }`}
                      >
                        <TableCell className="py-3.5 font-bold text-muted-foreground">{row.rank}</TableCell>
                        <TableCell className="py-3.5">
                          <span className="flex items-center gap-2.5 min-w-0">
                            <PlayerAvatar
                              variant="icon-only"
                              size="xs"
                              name={row.player_name}
                              avatarIndex={1}
                              playerId={row.player_id}
                            />
                            <span className="truncate font-bold text-foreground">
                              {row.player_name}
                              {verifiedIds.has(row.player_id) && <VerifiedBadge className="ml-1" />}
                              {row.player_id === playerId && <span className="text-primary text-xs font-normal"> (you)</span>}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5 text-right font-bold text-gold text-[1.1rem]">
                          {row.points.toLocaleString()}
                        </TableCell>
                        <TableCell className="py-3.5 text-center">
                          {row.streak > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                              🔥 {row.streak}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5 text-right font-semibold text-foreground/80 whitespace-nowrap">
                          {formatMinutes(row.minutes)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <p className="text-muted-foreground text-xs text-center mt-4">
            Earn Points from every game. Winning multiplayer matches and topping the Daily Challenge earns extra.
          </p>
        </motion.div>
      </main>

      <Dialog open={showHowItWorks} onOpenChange={setShowHowItWorks}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">How the leaderboard works</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-foreground/80">
            <div>
              <p className="font-bold text-foreground mb-1">🏆 Ranking</p>
              <p>
                Players are ranked by <span className="font-semibold text-foreground">minutes played</span> in
                the selected period. Use the toggle to rank by <span className="font-semibold text-foreground">Points</span> instead.
              </p>
            </div>
            <div>
              <p className="font-bold text-foreground mb-1">⏱️ Minutes played</p>
              <p>
                Your total time in games, across every mode. <span className="font-semibold text-foreground">Weekly</span> restarts
                every Sunday; <span className="font-semibold text-foreground">Monthly</span> restarts on the 1st of the month.
              </p>
            </div>
            <div>
              <p className="font-bold text-foreground mb-1">🏅 Points</p>
              <p className="mb-1.5">Earned in every game you finish, and they never reset:</p>
              <ul className="space-y-1 pl-4 list-disc marker:text-gold">
                <li>Your game score ÷ 100 (up to 20 Points per game)</li>
                <li>Multiplayer: +5 for every opponent you beat</li>
                <li>Daily Challenge top 3: +10 / +6 / +4 when the day ends</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-foreground mb-1">🔥 Daily streak</p>
              <p>Consecutive days playing the Daily Challenge. Miss a day and it resets.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
