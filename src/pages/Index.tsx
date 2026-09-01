import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Starfield } from "@/components/Starfield";
import { SiteFooter } from "@/components/SiteFooter";
import { Header } from "@/components/Header";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PlaylistCard } from "@/components/PlaylistCard";
import { Button } from "@/components/ui/button";
import { getMotionVariants, BUTTON_SPRING } from "@/lib/motion";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic } from "@/hooks/useAppleMusic";
import { PLAYLISTS, getPlaylistById, type Playlist } from "@/lib/playlists";
import { Headphones, Mic2, Trophy, Zap, CalendarDays, Flame, Play, Users, ArrowRight, ChevronRight, Clock } from "lucide-react";
import {
  fetchTodayChallenge,
  fetchDailyAttempts,
  fetchMyDailyStats,
  fetchDailyStatsForPlayers,
  isStreakActive,
  type DailyChallenge,
  type DailyAttempt,
  type DailyStats,
} from "@/lib/daily";
import { fetchVerifiedPlayerIds } from "@/lib/verifiedPlayers";

const HOW_TO_PLAY = [
  { icon: Headphones, title: "Listen to the Clip", desc: "Hear a snippet of a hit track from your favorite genre." },
  { icon: Mic2, title: "Guess the Song", desc: "Search for the artist or title as fast as you can." },
  { icon: Trophy, title: "Prove Your IQ", desc: "Score points for speed and accuracy to climb the leaderboard." },
] as const;

const FEATURED_PLAYLIST_ID = "afrobeats-chill";

function pickBattlefield(): Playlist[] {
  const featured = getPlaylistById(FEATURED_PLAYLIST_ID);
  const rest = PLAYLISTS.filter((p) => p.id !== FEATURED_PLAYLIST_ID);
  const shuffled = [...rest].sort(() => Math.random() - 0.5).slice(0, 4);
  return featured ? [featured, ...shuffled] : shuffled.slice(0, 5);
}

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

const Index = () => {
  const navigate = useNavigate();
  const { initializeAuth, setCategory } = useGameStore();
  const { getPlaylistTracks } = useAppleMusic();
  const shouldReduceMotion = useReducedMotion();
  const { container, pop, fade } = getMotionVariants(!!shouldReduceMotion);

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

  const [battlefield] = useState<Playlist[]>(pickBattlefield);
  const [battlefieldImages, setBattlefieldImages] = useState<Record<string, string>>({});

  // Client-side navigation to /#how-to-play (Header nav) doesn't scroll to
  // the hash on its own -- react-router leaves that to us
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, [location.hash]);

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
        // homepage works fine without the daily section
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
        // homepage works fine without the streak badge
      }
    })();
  }, [initializeAuth]);

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

  const handleBattlefieldClick = (playlist: Playlist) => {
    setCategory(playlist.id);
    navigate("/solo/game");
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Starfield />
      <Header />

      <main className="relative z-10 pt-[var(--header-height)] pb-12 px-4">
        <motion.div className="max-w-[900px] mx-auto" variants={container(0.12)} initial="hidden" animate="show">
          {/* Hero Section */}
          <motion.div className="text-center mb-[100px]" variants={fade}>
            <h1 className="font-display text-4xl md:text-6xl font-black tracking-tighter mb-2">
              <span className="block">Guess the <span className="text-primary">Song</span>.</span>
              <span className="block">Test Your Music IQ.</span>
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-2xl mx-auto mb-8">
              The ultimate music quiz game. Listen to a clip, guess the song or artist, and prove you're the biggest music fan.
            </p>

            <motion.div className="flex flex-wrap justify-center gap-4" variants={pop}>
              <Button
                variant="gold"
                size="xl"
                className="rounded-full h-auto w-64 flex-col gap-0 py-2.5 leading-tight"
                onClick={() => navigate("/solo")}
              >
                <span className="inline-flex items-center">
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  Play Solo
                </span>
                <span className="text-[11px] leading-tight font-medium normal-case tracking-normal opacity-80">
                  Challenge Yourself
                </span>
              </Button>
              <Button
                variant="kente"
                size="xl"
                className="rounded-full h-auto w-64 flex-col gap-0 py-2.5 leading-tight"
                onClick={() => navigate("/multiplayer")}
              >
                <span className="inline-flex items-center">
                  <Users className="w-4 h-4 mr-1.5" />
                  Play Multiplayer
                </span>
                <span className="text-[11px] leading-tight font-medium normal-case tracking-normal opacity-80">
                  Challenge Friends
                </span>
              </Button>
            </motion.div>
          </motion.div>

          {/* Daily Challenge quick-play */}
          {daily && (
            <motion.div variants={pop} className="daily-panel mb-[100px] grid md:grid-cols-2">
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
                <h2 className="font-display text-4xl text-foreground mb-3">
                  {daily.category_name}
                </h2>
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
                    <span className="font-display font-bold text-gold tabular-nums tracking-wide">
                      {dailyCountdown}
                    </span>
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
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg",
                          i === 0 && "bg-gold/10 border border-gold/30"
                        )}
                      >
                        <span className={cn("w-4 text-sm font-bold", i === 0 ? "text-gold" : "text-muted-foreground")}>
                          {i + 1}
                        </span>
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
                        <span className={cn("text-sm font-bold shrink-0", i === 0 ? "text-gold" : "text-foreground")}>
                          {row.score}
                        </span>
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
          )}

          {/* Pick Your Battlefield — deliberately wider than the page's 900px column */}
          <motion.section
            className="mb-[100px] relative left-1/2 -translate-x-1/2 w-screen max-w-[1100px] px-4"
            variants={container(0.08)}
          >
            <motion.h2 variants={fade} className="font-display text-4xl text-center mb-2">
              Pick Your Battlefield
            </motion.h2>
            <p className="text-muted-foreground text-sm text-center mb-8">
              Jump straight into a genre — new picks every visit
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {battlefield[0] && (
                <PlaylistCard
                  featured
                  variants={pop}
                  className="col-span-2 sm:row-span-2"
                  playlist={battlefield[0]}
                  imageUrl={battlefieldImages[battlefield[0].id]}
                  isSelected={false}
                  onClick={() => handleBattlefieldClick(battlefield[0])}
                />
              )}
              {battlefield.slice(1).map((p) => (
                <PlaylistCard
                  key={p.id}
                  variants={pop}
                  playlist={p}
                  imageUrl={battlefieldImages[p.id]}
                  isSelected={false}
                  onClick={() => handleBattlefieldClick(p)}
                />
              ))}
            </div>
            <motion.div variants={fade} className="flex justify-center mt-6">
              <Button variant="outline" onClick={() => navigate("/solo")}>
                View All Genres
              </Button>
            </motion.div>
          </motion.section>

          {/* How It Works Section */}
          <motion.section id="how-to-play" className="mb-[100px] scroll-mt-24" variants={container(0.08)}>
            <motion.h2 variants={fade} className="font-display text-4xl text-center mb-8">
              How to Play
            </motion.h2>
            <div className="flex flex-col md:flex-row items-stretch gap-6 md:gap-3">
              {HOW_TO_PLAY.map((step, i) => (
                <div key={step.title} className="flex items-center gap-3 flex-1">
                  <motion.div variants={pop} className="raised-panel text-center p-6 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
                      <step.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-display text-lg mb-2">{step.title}</h3>
                    <p className="text-muted-foreground text-sm">{step.desc}</p>
                  </motion.div>
                  {i < HOW_TO_PLAY.length - 1 && (
                    <ChevronRight className="hidden md:block w-6 h-6 text-muted-foreground shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </motion.section>

          {/* CTA Section */}
          <motion.section className="text-center" variants={pop}>
            <div className="raised-panel p-16">
              <h2 className="font-display text-2xl md:text-3xl mb-2">
                Ready to <span className="text-primary">Play?</span>
              </h2>
              <p className="text-muted-foreground text-sm mb-6">
                Listen to a clip, guess the song or artist, and prove you're the biggest music fan.
                <br className="hidden sm:block" />
                Challenge yourself solo or battle friends in real-time.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button variant="gold" size="lg" className="rounded-full w-64" onClick={() => navigate("/solo")}>
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  Play Solo
                </Button>
                <Button variant="kente" size="lg" className="rounded-full w-64" onClick={() => navigate("/multiplayer")}>
                  <Users className="w-4 h-4 mr-1.5" />
                  Play Multiplayer
                </Button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Index;
