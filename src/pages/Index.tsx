import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { GameModeCard } from "@/components/GameModeCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { getMotionVariants, BUTTON_SPRING } from "@/lib/motion";
import { useGameStore } from "@/lib/gameStore";
import { Headphones, Mic2, Trophy, Zap, CalendarDays, ChevronRight, Flame } from "lucide-react";
import { fetchTodayChallenge, fetchDailyAttempts, fetchMyDailyStats, isStreakActive, type DailyChallenge, type DailyAttempt } from "@/lib/daily";

const MEDALS = ["🥇", "🥈", "🥉"];

const STATS = [
  { value: "8+", label: "Genres", valueClass: "text-primary", chipClass: "border-primary/50 bg-primary/15" },
  { value: "1000+", label: "Songs", valueClass: "text-deep-purple", chipClass: "border-deep-purple/50 bg-deep-purple/15" },
  { value: "∞", label: "Fun", valueClass: "text-kente-green", chipClass: "border-kente-green/50 bg-kente-green/15" },
] as const;

const HOW_TO_PLAY = [
  { icon: Headphones, title: "Listen", desc: "Hear a short clip from a trending song" },
  { icon: Mic2, title: "Guess", desc: "Pick the correct song title or artist name" },
  { icon: Trophy, title: "Win", desc: "Score points, climb the leaderboard & flex your IQ" },
] as const;

const GENRES = ["Afrobeats", "Amapiano", "Highlife", "Bongo Flava", "Afro-Pop", "Naija Hits", "Gospel", "Hip-Hop"];

const Index = () => {
  const navigate = useNavigate();
  const { initializeAuth } = useGameStore();
  const shouldReduceMotion = useReducedMotion();
  const { container, pop, pill, fade } = getMotionVariants(!!shouldReduceMotion);

  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [topThree, setTopThree] = useState<DailyAttempt[]>([]);
  const [myStreak, setMyStreak] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const challenge = await fetchTodayChallenge();
        if (!challenge) return;
        setDaily(challenge);
        const { attempts } = await fetchDailyAttempts(challenge.challenge_date);
        setTopThree(attempts.slice(0, 3));
      } catch {
        // homepage works fine without the daily banner
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

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Starfield />
      <Header />

      <main className="relative z-10 pt-24 pb-12 px-4">
        <motion.div className="max-w-4xl mx-auto" variants={container(0.12)} initial="hidden" animate="show">
          {/* Hero Section */}
          <motion.div className="text-center mb-12" variants={fade}>
            <h1 className="font-display text-5xl md:text-7xl leading-[1.05] mb-4">
              Guess the <span className="text-primary">Song</span> — Test Your Music IQ.
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              The ultimate music quiz game for Afrobeats, Amapiano, Highlife, Bongo Flava & more.
              Listen to a clip, guess the song or artist, and prove you're the biggest music fan.
            </p>
          </motion.div>

          {/* Daily Challenge banner */}
          {daily && (
            <motion.button
              onClick={() => navigate("/daily")}
              variants={pop}
              className="raised-panel w-full max-w-2xl mx-auto mb-6 flex items-center justify-between gap-3 px-5 py-4 border-gold/50 bg-gold/10 hover:bg-gold/20 transition-colors text-left"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              transition={BUTTON_SPRING}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="relative inline-flex items-center justify-center rounded-full p-1.5 shrink-0">
                  {myStreak > 0 ? (
                    <>
                      <span className={cn("absolute inset-0 rounded-full", !shouldReduceMotion && "pulse-kente")} />
                      <motion.span
                        className="inline-flex"
                        animate={shouldReduceMotion ? undefined : { scale: [1, 1.15, 1] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Flame className="w-7 h-7 text-kente-green" />
                      </motion.span>
                      <span className="absolute -bottom-1 -right-1 rounded-full bg-kente-green text-[10px] font-bold px-1.5 leading-4 text-background">
                        {myStreak}
                      </span>
                    </>
                  ) : (
                    <CalendarDays className="w-8 h-8 text-gold" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-foreground">
                    Daily Challenge #{daily.number}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {daily.category_name} · same 10 songs for everyone · one attempt
                  </span>
                  {topThree.length > 0 && (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-foreground/80">
                      {topThree.map((a, i) => (
                        <span key={a.player_id} className="flex items-center gap-1 truncate">
                          {MEDALS[i]}
                          <PlayerAvatar variant="icon-only" size="2xs" name={a.player_name} avatarIndex={1} playerId={a.player_id} />
                          <span className="font-semibold truncate max-w-[90px]">{a.player_name}</span>
                          <span className="text-gold font-bold">{a.score}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight className="w-6 h-6 text-gold shrink-0" />
            </motion.button>
          )}

          {/* Game Mode Cards */}
          <motion.div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-12" variants={container(0.12)}>
            <GameModeCard
              variants={pop}
              title="Solo Music Quiz"
              description="Guess the song & artist — play at your own pace"
              icon="solo"
              onClick={() => navigate("/solo")}
              isPrimary
            />
            <GameModeCard
              variants={pop}
              title="Multiplayer Challenge"
              description="Challenge friends in real-time music trivia"
              icon="multiplayer"
              onClick={() => navigate("/multiplayer")}
            />
          </motion.div>

          {/* Quick Stats */}
          <motion.div className="flex justify-center gap-4 sm:gap-6 mb-16" variants={container(0.08)}>
            {STATS.map((s) => (
              <motion.div key={s.label} variants={pop} className={cn("stat-chip", s.chipClass)}>
                <span className={cn("stat-chip-value", s.valueClass)}>{s.value}</span>
                <span className="stat-chip-label">{s.label}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* How It Works Section */}
          <motion.section className="mb-16" variants={container(0.08)}>
            <motion.h2 variants={fade} className="font-display text-2xl md:text-3xl text-center mb-8">
              How to <span className="text-primary">Play</span>
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
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

          {/* Genre Highlights */}
          <motion.section className="mb-16" variants={container(0.05)}>
            <motion.h2 variants={fade} className="font-display text-2xl md:text-3xl text-center mb-8">
              African Music <span className="text-primary">Genres</span> We Cover
            </motion.h2>
            <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
              {GENRES.map((genre) => (
                <motion.span
                  key={genre}
                  variants={pill}
                  className="px-4 py-2 rounded-full border-2 border-deep-purple/40 bg-deep-purple/10 text-sm text-foreground/80 font-medium"
                >
                  {genre}
                </motion.span>
              ))}
            </div>
            <p className="text-muted-foreground text-sm text-center mt-4 max-w-xl mx-auto">
              From Burna Boy to Wizkid, Tems to Asake — guess the song from today's hottest African artists and classic throwbacks.
            </p>
          </motion.section>

          {/* CTA Section */}
          <motion.section className="text-center" variants={pop}>
            <div className="raised-panel p-8 max-w-xl mx-auto">
              <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
              <h2 className="font-display text-xl md:text-2xl mb-2">
                Ready to Play?
              </h2>
              <p className="text-muted-foreground text-sm mb-6">
                No sign-up needed. Jump straight into the music quiz and start guessing songs now — it's free!
              </p>
              <Button variant="gold" size="lg" onClick={() => navigate("/solo")}>
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
