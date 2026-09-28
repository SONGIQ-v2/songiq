import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Swords } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ChallengeCard } from "@/components/ChallengeCard";
import { useGameStore } from "@/lib/gameStore";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";
import {
  listPublicChallenges,
  fetchMyChallengeScores,
  PUBLIC_CHALLENGES_PAGE_SIZE,
  type PublicChallengeSummary,
} from "@/lib/challenges";

export default function BrowseChallenges() {
  const navigate = useNavigate();
  const { playerId, initializeAuth } = useGameStore();

  const [challenges, setChallenges] = useState<PublicChallengeSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [myScores, setMyScores] = useState<Map<string, number>>(new Map());

  // Non-blocking -- doesn't gate the list's own fetch, same pattern
  // Leaderboard.tsx uses (a visitor's session resolving shouldn't delay
  // showing the public feed).
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    (async () => {
      const rows = await listPublicChallenges(0);
      setChallenges(rows);
      setHasMore(rows.length === PUBLIC_CHALLENGES_PAGE_SIZE);
      setStatus("ready");
      fetchVerifiedPlayerIds(rows.map((r) => r.creator_id)).then(setVerifiedIds);
    })();
  }, []);

  useEffect(() => {
    if (!playerId || challenges.length === 0) return;
    fetchMyChallengeScores(challenges.map((c) => c.code), playerId).then(setMyScores);
  }, [playerId, challenges]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const rows = await listPublicChallenges(challenges.length);
    setChallenges((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PUBLIC_CHALLENGES_PAGE_SIZE);
    setLoadingMore(false);
    const newIds = rows.map((r) => r.creator_id);
    if (newIds.length > 0) {
      fetchVerifiedPlayerIds(newIds).then((ids) => {
        setVerifiedIds((prev) => new Set([...prev, ...ids]));
      });
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>Active Challenges | SongIQ</title>
        <meta
          name="description"
          content="Browse live SongIQ challenges from real players. Pick one, beat their score, and see if you can top the leaderboard."
        />
      </Helmet>
      <Starfield />
      <Header />

      <main className="relative z-10 pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+100px)] pb-12 px-4">
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-[1200px] mx-auto text-center mb-6"
        >
          <h1 className="glow-heading mb-1">Active Challenges</h1>
          <p className="text-muted-foreground text-sm">Real players, real scores — pick one and beat it</p>
        </motion.div>

        <div className="max-w-[1200px] mx-auto">
          {status === "loading" && (
            <div className="text-center z-10 py-20">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 mx-auto mb-4"
              >
                <Music2 className="w-full h-full text-gold" />
              </motion.div>
              <p className="text-xl text-foreground/80">Loading challenges...</p>
            </div>
          )}

          {status === "ready" && challenges.length === 0 && (
            <div className="text-center z-10 max-w-md mx-auto py-20">
              <Swords className="w-10 h-10 text-primary mx-auto mb-4" />
              <p className="text-2xl font-bold text-foreground mb-2">No challenges yet</p>
              <p className="text-muted-foreground mb-6">
                Be the first — play a game, share your challenge link, and see your name at the top.
              </p>
              <Button variant="gold" size="lg" onClick={() => navigate("/solo")}>
                Play SongIQ
              </Button>
            </div>
          )}

          {status === "ready" && challenges.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {challenges.map((c) => (
                  <ChallengeCard
                    key={c.code}
                    challenge={c}
                    verified={verifiedIds.has(c.creator_id ?? "")}
                    isOwn={!!playerId && c.creator_id === playerId}
                    myScore={myScores.get(c.code)}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="text-center mt-6">
                  <Button variant="outline" size="lg" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
