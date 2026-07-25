import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { GameModeCard } from "@/components/GameModeCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlaylistCard } from "@/components/PlaylistCard";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getMotionVariants, BUTTON_SPRING } from "@/lib/motion";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic } from "@/hooks/useAppleMusic";
import { PLAYLISTS, getPlaylistById, type Playlist } from "@/lib/playlists";
import { Headphones, Mic2, Trophy, Zap, CalendarDays, Flame, Play } from "lucide-react";
import { trackModeSelected } from "@/lib/analytics";
import {
  fetchTodayChallenge,
  fetchDailyAttempts,
  fetchMyDailyStats,
  fetchDailyStatsForPlayers,
  fetchDailyStatsLeaderboard,
  isStreakActive,
  type DailyChallenge,
  type DailyAttempt,
  type DailyStats,
} from "@/lib/daily";

const HOW_TO_PLAY = [
  { icon: Headphones, title: "Listen", desc: "Hear a short clip from a trending song" },
  { icon: Mic2, title: "Guess", desc: "Pick the correct song title or artist name" },
  { icon: Trophy, title: "Win", desc: "Score points, climb the leaderboard & flex your IQ" },
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

const Index = () => {
  const navigate = useNavigate();
  const { initializeAuth, setCategory } = useGameStore();
  const { getPlaylistTracks } = useAppleMusic();
  const shouldReduceMotion = useReducedMotion();
  const { container, pop, fade } = getMotionVariants(!!shouldReduceMotion);

  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [dailyBoard, setDailyBoard] = useState<DailyBoardRow[]>([]);
  const [overallBoard, setOverallBoard] = useState<DailyStats[]>([]);
  const [dailyTab, setDailyTab] = useState<"today" | "overall">("today");
  const [myStreak, setMyStreak] = useState(0);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [totalPlayedToday, setTotalPlayedToday] = useState(0);

  const [battlefield] = useState<Playlist[]>(pickBattlefield);
  const [battlefieldImages, setBattlefieldImages] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const challenge = await fetchTodayChallenge();
        if (!challenge) return;
        setDaily(challenge);
        const { attempts, total } = await fetchDailyAttempts(challenge.challenge_date);
        setTotalPlayedToday(total);
        const top = attempts.slice(0, 5);
        const statsById = await fetchDailyStatsForPlayers(top.map((a) => a.player_id));
        setDailyBoard(
          top.map((a) => {
            const stats = statsById[a.player_id] ?? null;
            return { ...a, streak: isStreakActive(stats) ? stats!.current_streak : 0 };
          })
        );
        const allTime = await fetchDailyStatsLeaderboard();
        setOverallBoard(allTime.slice(0, 5));
      } catch {
        // homepage works fine without the daily section
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const pid = await initializeAuth();
        setPlayerId(pid);
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
        battlefield.map((p) => getPlaylistTracks(p.searchTerms, p.name, 5))
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
    trackModeSelected("solo", "battlefield");
    setCategory(playlist.id);
    navigate("/solo/game");
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Starfield />
      <Header />

      <main className="relative z-10 pt-24 pb-12 px-4">
        <motion.div className="max-w-[900px] mx-auto" variants={container(0.12)} initial="hidden" animate="show">
          {/* Hero Section */}
          <motion.div className="text-center mb-12" variants={fade}>
            <h1 className="font-display text-5xl md:text-7xl leading-[1.05] mb-4">
              Guess the <span className="text-primary">Song</span>: Test Your Music IQ.
            </h1>
            <p className="text-muted-foreground text-lg">
              The ultimate music quiz game for Afrobeats, Amapiano, Highlife, Bongo Flava & more.
              Listen to a clip, guess the song or artist, and prove you're the biggest music fan.
            </p>
          </motion.div>

          {/* Two Ways to Play */}
          <motion.section className="mb-16" variants={container(0.12)}>
            <motion.h2 variants={fade} className="font-display text-2xl md:text-3xl text-center mb-8">
              Two Ways to Play
            </motion.h2>
            <div className="grid md:grid-cols-2 gap-6">
              <GameModeCard
                variants={pop}
                title="Solo Music Quiz"
                description="Guess the song & artist — play at your own pace"
                icon="solo"
                onClick={() => {
                  trackModeSelected("solo");
                  navigate("/solo");
                }}
                isPrimary
              />
              <GameModeCard
                variants={pop}
                title="Multiplayer Challenge"
                description="Challenge friends in real-time music trivia"
                icon="multiplayer"
                onClick={() => {
                  trackModeSelected("multiplayer");
                  navigate("/multiplayer");
                }}
              />
            </div>
          </motion.section>

          {/* Daily Challenge quick-play */}
          {daily && (
            <motion.div variants={pop} className="raised-panel p-5 mb-16 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative inline-flex items-center justify-center rounded-full p-1.5 shrink-0">
                  <span
                    className={cn(
                      "absolute inset-0 rounded-full",
                      !shouldReduceMotion && (myStreak > 0 ? "pulse-kente" : "pulse-gold")
                    )}
                  />
                  <motion.span
                    className="inline-flex"
                    animate={shouldReduceMotion ? undefined : { scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {myStreak > 0 ? (
                      <Flame className="w-7 h-7 text-kente-green" />
                    ) : (
                      <CalendarDays className="w-8 h-8 text-gold" />
                    )}
                  </motion.span>
                  {myStreak > 0 && (
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-kente-green text-[10px] font-bold px-1.5 leading-4 text-background">
                      {myStreak}
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-display text-foreground truncate">Daily Challenge #{daily.number}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {daily.category_name} · {totalPlayedToday > 0 ? `${totalPlayedToday} played today` : "Be the first to play"}
                  </p>
                </div>
              </div>
              <Button variant="gold" onClick={() => { trackModeSelected("daily", "home_banner"); navigate("/daily"); }} className="shrink-0">
                <Play className="w-4 h-4 mr-1.5 fill-current" />
                Play
              </Button>
            </motion.div>
          )}

          {/* Pick Your Battlefield — deliberately wider than the page's 900px column */}
          <motion.section
            className="mb-16 relative left-1/2 -translate-x-1/2 w-screen max-w-[1100px] px-4"
            variants={container(0.08)}
          >
            <motion.h2 variants={fade} className="font-display text-2xl md:text-3xl text-center mb-2">
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
          <motion.section className="mb-16" variants={container(0.08)}>
            <motion.h2 variants={fade} className="font-display text-2xl md:text-3xl text-center mb-8">
              How to Play
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {HOW_TO_PLAY.map((step) => (
                <motion.div key={step.title} variants={pop} className="raised-panel text-center p-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-display text-lg mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Daily Challenge */}
          {daily && (
            <motion.section className="mb-16" variants={container(0.08)}>
              <motion.h2 variants={fade} className="font-display text-2xl md:text-3xl text-center mb-8">
                Daily Challenge
              </motion.h2>

              {(dailyBoard.length > 0 || overallBoard.length > 0) && (
                <motion.div variants={pop} className="raised-panel p-4">
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setDailyTab("today")}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all",
                        dailyTab === "today"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-card/50 text-muted-foreground"
                      )}
                    >
                      Today's Leaderboard
                    </button>
                    <button
                      onClick={() => setDailyTab("overall")}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all",
                        dailyTab === "overall"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-card/50 text-muted-foreground"
                      )}
                    >
                      Overall Leaderboard
                    </button>
                  </div>

                  {dailyTab === "today" ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">Rank</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead className="text-center">Streak</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyBoard.map((row, i) => (
                          <TableRow
                            key={row.player_id}
                            className={row.player_id === playerId ? "bg-primary/10" : undefined}
                          >
                            <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-2 min-w-0">
                                <PlayerAvatar variant="icon-only" size="xs" name={row.player_name} avatarIndex={1} playerId={row.player_id} />
                                <span className="truncate">
                                  {row.player_name}
                                  {row.player_id === playerId && <span className="text-primary text-xs"> (you)</span>}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {row.streak > 0 ? (
                                <span className="inline-flex items-center gap-1 text-kente-green font-semibold">
                                  <Flame className="w-3.5 h-3.5" />
                                  {row.streak}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-gold">{row.score}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">Rank</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead className="text-center">Streak</TableHead>
                          <TableHead className="text-right">Total Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overallBoard.map((row, i) => (
                          <TableRow
                            key={row.player_id}
                            className={row.player_id === playerId ? "bg-primary/10" : undefined}
                          >
                            <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-2 min-w-0">
                                <PlayerAvatar variant="icon-only" size="xs" name={row.player_name} avatarIndex={1} playerId={row.player_id} />
                                <span className="truncate">
                                  {row.player_name}
                                  {row.player_id === playerId && <span className="text-primary text-xs"> (you)</span>}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {isStreakActive(row) ? (
                                <span className="inline-flex items-center gap-1 text-kente-green font-semibold">
                                  <Flame className="w-3.5 h-3.5" />
                                  {row.current_streak}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-gold">{row.total_score}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </motion.div>
              )}

              <motion.div variants={pop} className="text-center mt-6">
                <Button variant="gold" onClick={() => { trackModeSelected("daily", "daily_section"); navigate("/daily"); }}>
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  Play Today's Challenge
                </Button>
              </motion.div>
            </motion.section>
          )}

          {/* CTA Section */}
          <motion.section className="text-center" variants={pop}>
            <div className="raised-panel p-8">
              <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
              <h2 className="font-display text-xl md:text-2xl mb-2">
                Ready to Play?
              </h2>
              <p className="text-muted-foreground text-sm mb-6">
                No sign-up needed. Jump straight into the music quiz and start guessing songs now — it's free!
              </p>
              <Button variant="gold" size="lg" onClick={() => { trackModeSelected("solo", "cta"); navigate("/solo"); }}>
                Start Guessing Songs
              </Button>
            </div>
          </motion.section>
        </motion.div>
      </main>
    </div>
  );
};

export default Index;
