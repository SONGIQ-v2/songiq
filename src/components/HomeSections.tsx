// The homepage's live sections -- today's Daily Challenge, Pick Your
// Battlefield, Active Challenges -- as self-contained components (each
// fetches its own data), shared by the homepage and the SEO landing pages
// (SeoLanding.tsx) so a change to one shows up on all of them.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, Clock, Flame, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PlaylistCard } from "@/components/PlaylistCard";
import { ChallengeCard } from "@/components/ChallengeCard";
import { Button } from "@/components/ui/button";
import { getMotionVariants } from "@/lib/motion";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic } from "@/hooks/useAppleMusic";
import { PLAYLISTS, getPlaylistById, type Playlist } from "@/lib/playlists";
import { COUNTRY_CHART_IDS, detectRegion, type VisitorRegion } from "@/lib/region";
import {
  fetchTodayChallenge,
  fetchDailyAttempts,
  fetchMyDailyStats,
  fetchDailyStatsForPlayers,
  isStreakActive,
  type DailyChallenge,
  type DailyAttempt,
} from "@/lib/daily";
import { listPublicChallenges, fetchMyChallengeScores, type PublicChallengeSummary } from "@/lib/challenges";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";

// Each section animates itself in as it scrolls into view, so it works the
// same whether or not a parent orchestrates the page's entrance.
const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.15 } } as const;

function useVariants() {
  const reduced = useReducedMotion();
  return getMotionVariants(!!reduced);
}

// ---------------------------------------------------------------------------
// Daily Challenge quick-play
// ---------------------------------------------------------------------------

interface DailyBoardRow extends DailyAttempt {
  streak: number;
}

// The daily challenge's day boundary is Lagos midnight (UTC+1), matching
// the edge function that generates it (cleanup-stale-rooms/index.ts:
// `lagosToday = new Date(now + 1h).toISOString().slice(0, 10)`) -- so in
// UTC terms, the boundary is 23:00 every day.
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

export function DailyChallengeSection({ className = "mb-[100px]" }: { className?: string }) {
  const navigate = useNavigate();
  const { initializeAuth } = useGameStore();
  const shouldReduceMotion = useReducedMotion();
  const { pop } = useVariants();

  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [dailyBoard, setDailyBoard] = useState<DailyBoardRow[]>([]);
  const [myStreak, setMyStreak] = useState(0);
  const [totalPlayedToday, setTotalPlayedToday] = useState(0);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [dailyCountdown, setDailyCountdown] = useState("");

  // Ticks once a second while today's challenge is shown, so "Ends in" stays live.
  useEffect(() => {
    if (!daily) return;
    const tick = () => setDailyCountdown(formatCountdown(getNextDailyResetUTC(new Date()).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [daily]);

  useEffect(() => {
    (async () => {
      try {
        const challenge = await fetchTodayChallenge();
        if (!challenge) return;
        setDaily(challenge);
        const { attempts, total } = await fetchDailyAttempts(challenge.challenge_date);
        setTotalPlayedToday(total);
        const statsById = await fetchDailyStatsForPlayers(attempts.map((a) => a.player_id));
        setDailyBoard(
          attempts.map((a) => {
            const stats = statsById[a.player_id] ?? null;
            return { ...a, streak: isStreakActive(stats) ? stats!.current_streak : 0 };
          })
        );
        fetchVerifiedPlayerIds(attempts.map((a) => a.player_id)).then(setVerifiedIds);
      } catch {
        // the page works fine without the daily section
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const pid = await initializeAuth();
        if (!pid) return;
        const stats = await fetchMyDailyStats(pid);
        setMyStreak(isStreakActive(stats) ? stats?.current_streak ?? 0 : 0);
      } catch {
        // the page works fine without the streak badge
      }
    })();
  }, [initializeAuth]);

  if (!daily) return null;

  return (
    <motion.div {...inView} variants={pop} className={cn("daily-panel grid md:grid-cols-2", className)}>
      {/* Left: today's challenge */}
      <div className="daily-panel-hero p-6 md:p-12 flex flex-col justify-center">
        <div className="relative z-10 flex flex-col">
          {myStreak > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <motion.span
                className="inline-flex"
                animate={shouldReduceMotion ? undefined : { scale: [1, 1.15, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <Flame className="w-5 h-5 text-kente-green" />
              </motion.span>
              <span className="text-sm font-bold text-kente-green">{myStreak} Day Streak</span>
            </div>
          )}
          <span className="inline-flex items-center gap-1.5 w-fit px-3 py-1 rounded-full bg-gold/15 text-gold text-xs font-bold uppercase tracking-wide mb-4">
            <CalendarDays className="w-3.5 h-3.5" />
            Daily Challenge #{daily.number}
          </span>
          <h2 className="font-display text-4xl text-foreground mb-3">{daily.category_name}</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Beat today's high score and claim your spot on the leaderboard.
          </p>
          <Button variant="gold" size="lg" className="w-fit" onClick={() => navigate("/daily")}>
            <Zap className="w-4 h-4 mr-1.5 fill-current" />
            Play Challenge
          </Button>
          {dailyCountdown && (
            <div className="flex items-center gap-1.5 mt-4 text-sm">
              <Clock className="w-3.5 h-3.5 text-gold" />
              <span className="text-muted-foreground">Ends in</span>
              <span className="font-display font-bold text-gold tabular-nums tracking-wide">{dailyCountdown}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: Daily Top 5 */}
      <div className="p-6 md:p-12 border-t-2 md:border-t-0 md:border-l-2 border-border/60">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Daily Top 5</h3>
          <button
            onClick={() => navigate("/daily")}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            Full Board <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {dailyBoard.length > 0 ? (
          <div className="space-y-1">
            {dailyBoard.slice(0, 5).map((row, i) => (
              <div
                key={row.player_id}
                className={cn("flex items-center gap-3 px-3 py-2 rounded-lg", i === 0 && "bg-gold/10 border border-gold/30")}
              >
                <span className={cn("w-4 text-sm font-bold", i === 0 ? "text-gold" : "text-muted-foreground")}>{i + 1}</span>
                <PlayerAvatar variant="icon-only" size="xs" name={row.player_name} avatarIndex={1} playerId={row.player_id} />
                <span className="flex-1 truncate text-sm font-bold text-foreground">
                  {row.player_name}
                  {verifiedIds.has(row.player_id) && <VerifiedBadge className="ml-1" />}
                </span>
                {row.streak > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground shrink-0">
                    🔥 {row.streak}
                  </span>
                )}
                <span className={cn("text-sm font-bold shrink-0", i === 0 ? "text-gold" : "text-foreground")}>{row.score}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            {totalPlayedToday > 0 ? "Loading today's scores…" : "Be the first to play today!"}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Pick Your Battlefield
// ---------------------------------------------------------------------------

const FEATURED_PLAYLIST_ID = "afrobeats-chill";

// Big featured card per visitor region (see detectRegion() -- device time
// zone, no IP lookup). Anywhere not listed keeps Afrobeats & Chill.
const FEATURED_BY_REGION: Partial<Record<VisitorRegion, string>> = {
  ghana: "ghana-sounds",
  "south-africa": "amapiano-hits",
  "east-africa": "east-africa-vibes",
  us: "us-pop-hits",
  canada: "trending-canada",
  uk: "uk-drill-grime",
  germany: "trending-germany",
  sweden: "trending-sweden",
  australia: "trending-australia",
};

// A region's own country chart is always among its cards (when it isn't
// already the featured one). Country charts are otherwise kept out of the
// random picks -- a US visitor shouldn't be offered "Trending Sweden".
const CHART_BY_REGION: Partial<Record<VisitorRegion, string>> = {
  ghana: "trending-ghana",
  "south-africa": "trending-south-africa",
  us: "global-top-100",
  canada: "trending-canada",
  uk: "trending-uk",
  germany: "trending-germany",
  sweden: "trending-sweden",
  australia: "trending-australia",
};

// Regions whose own scene is pop / rap / R&B rather than African music.
const WESTERN_REGIONS = new Set<VisitorRegion>(["us", "canada", "uk", "germany", "sweden", "australia"]);

const shuffle = <T,>(items: T[]): T[] => [...items].sort(() => Math.random() - 0.5);

function pickBattlefield(): Playlist[] {
  const region = detectRegion();
  const featuredId = FEATURED_BY_REGION[region] ?? FEATURED_PLAYLIST_ID;
  const featured = getPlaylistById(featuredId);
  const chartId = CHART_BY_REGION[region];
  const chart = chartId && chartId !== featuredId ? getPlaylistById(chartId) : undefined;
  const pinned = [featured, chart].filter((p): p is Playlist => !!p);
  const rest = PLAYLISTS.filter((p) => !pinned.includes(p) && !COUNTRY_CHART_IDS.has(p.id));
  const slots = 5 - pinned.length;

  let others: Playlist[];
  if (WESTERN_REGIONS.has(region)) {
    // Their own scene first (pop / rap / R&B), plus one African genre
    // playlist so SongIQ's African catalogue is still discoverable.
    const local = shuffle(rest.filter((p) => p.category === "pop" || p.category === "rap" || p.category === "rnb"));
    const african = shuffle(rest.filter((p) => p.category === "africa" && !p.isArtist));
    others = [...local.slice(0, slots - 1), ...african.slice(0, 1)];
  } else if (region === "other") {
    others = shuffle(rest).slice(0, slots);
  } else {
    // Any African region: African music and gospel.
    others = shuffle(rest.filter((p) => p.category === "africa" || p.category === "gospel")).slice(0, slots);
  }
  return [...pinned, ...others];
}

export function BattlefieldSection({ className = "mb-[100px]" }: { className?: string }) {
  const navigate = useNavigate();
  const { setCategory } = useGameStore();
  const { getPlaylistTracks } = useAppleMusic();
  const { container, pop, fade } = useVariants();

  const [battlefield] = useState<Playlist[]>(pickBattlefield);
  const [battlefieldImages, setBattlefieldImages] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const results = await Promise.all(
        battlefield.map((p) => getPlaylistTracks(p.searchTerms, p.name, 5, p.isArtist))
      );
      const images: Record<string, string> = {};
      results.forEach((r, i) => {
        if (r?.playlistImage) images[battlefield[i].id] = r.playlistImage;
      });
      setBattlefieldImages(images);
    })();
    // battlefield is computed once on mount and never changes afterward
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = (playlist: Playlist) => {
    setCategory(playlist.id);
    navigate("/solo/game");
  };

  return (
    // Deliberately wider than the page's content column
    <motion.section
      {...inView}
      className={cn("relative left-1/2 -translate-x-1/2 w-screen max-w-[1100px] px-4", className)}
      variants={container(0.08)}
    >
      <motion.h2 variants={fade} className="font-display text-4xl text-center mb-2">
        Pick Your Battlefield
      </motion.h2>
      <p className="text-muted-foreground text-sm text-center mb-8">Jump straight into a genre — new picks every visit</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {battlefield[0] && (
          <PlaylistCard
            featured
            variants={pop}
            className="col-span-2 sm:row-span-2"
            playlist={battlefield[0]}
            imageUrl={battlefieldImages[battlefield[0].id]}
            isSelected={false}
            onClick={() => handleClick(battlefield[0])}
          />
        )}
        {battlefield.slice(1).map((p) => (
          <PlaylistCard
            key={p.id}
            variants={pop}
            playlist={p}
            imageUrl={battlefieldImages[p.id]}
            isSelected={false}
            onClick={() => handleClick(p)}
          />
        ))}
      </div>
      <motion.div variants={fade} className="flex justify-center mt-6">
        <Button variant="outline" onClick={() => navigate("/solo")}>
          View All Genres
        </Button>
      </motion.div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Active Challenges
// ---------------------------------------------------------------------------

/**
 * Real players' scores (see src/pages/BrowseChallenges.tsx for the full
 * feed). Omitted entirely -- no empty-state teaser -- until at least one
 * challenge has actually been played.
 */
export function ActiveChallengesSection({ className = "mb-[100px]" }: { className?: string }) {
  const navigate = useNavigate();
  const { playerId } = useGameStore();
  const { container, pop, fade } = useVariants();

  const [activeChallenges, setActiveChallenges] = useState<PublicChallengeSummary[]>([]);
  const [challengeVerifiedIds, setChallengeVerifiedIds] = useState<Set<string>>(new Set());
  const [myChallengeScores, setMyChallengeScores] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const rows = await listPublicChallenges(0, 3);
        setActiveChallenges(rows);
        fetchVerifiedPlayerIds(rows.map((r) => r.creator_id)).then(setChallengeVerifiedIds);
      } catch {
        // the page works fine without the active-challenges section
      }
    })();
  }, []);

  useEffect(() => {
    if (!playerId || activeChallenges.length === 0) return;
    fetchMyChallengeScores(activeChallenges.map((c) => c.code), playerId).then(setMyChallengeScores);
  }, [playerId, activeChallenges]);

  if (activeChallenges.length === 0) return null;

  return (
    <motion.section {...inView} className={className} variants={container(0.08)}>
      <motion.h2 variants={fade} className="font-display text-4xl text-center mb-2">
        Active Challenges
      </motion.h2>
      <p className="text-muted-foreground text-sm text-center mb-8">Real players, real scores — pick one and beat it</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activeChallenges.map((c) => (
          <ChallengeCard
            key={c.code}
            variants={pop}
            challenge={c}
            verified={challengeVerifiedIds.has(c.creator_id ?? "")}
            isOwn={!!playerId && c.creator_id === playerId}
            myScore={myChallengeScores.get(c.code)}
          />
        ))}
      </div>
      <motion.div variants={fade} className="flex justify-center mt-6">
        <Button variant="outline" onClick={() => navigate("/challenges")}>
          View All Challenges
        </Button>
      </motion.div>
    </motion.section>
  );
}
