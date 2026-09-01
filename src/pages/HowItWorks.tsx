import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Headphones, Mic2, Trophy, Users, CalendarDays, Link2, Medal, Clock, Flame, Play, ChevronRight,
} from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { getMotionVariants } from "@/lib/motion";

const STEPS = [
  { icon: Headphones, title: "Listen to the clip", desc: "Every round plays a short real audio preview of a track." },
  { icon: Mic2, title: "Guess fast", desc: "Pick the song or artist from 4 choices. The quicker you answer, the more it's worth." },
  { icon: Trophy, title: "See how you did", desc: "After the last round, get your score, accuracy, and a full breakdown of every song." },
] as const;

const MODES = [
  {
    icon: Headphones,
    title: "Solo",
    tagline: "Play anytime, at your own pace",
    points: [
      "Pick any playlist or artist spotlight",
      "10 rounds, no time pressure between them",
      "Turn any finished game into a Challenge link to send to friends",
    ],
  },
  {
    icon: CalendarDays,
    title: "Daily Challenge",
    tagline: "One shot, same songs as everyone else",
    points: [
      "Everyone gets the exact same 10 songs each day",
      "One attempt per day, resetting at midnight, so make it count",
      "Play daily to build a streak, and the top 3 each day earn bonus Points",
    ],
  },
  {
    icon: Users,
    title: "Multiplayer",
    tagline: "Live, real-time, with friends",
    points: [
      "Create a room and share the code, no app required to join",
      "Everyone hears the same clip at the same moment and races to answer",
      "Beat an opponent's score in a room to earn bonus Points",
    ],
  },
  {
    icon: Link2,
    title: "Challenge links",
    tagline: "Your exact game, sent to a friend",
    points: [
      "Generated automatically after any Solo game you finish",
      "Friends play the identical songs you did and compare scores",
      "See a live leaderboard of everyone who's taken your challenge",
    ],
  },
] as const;

export default function HowItWorks() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { container, pop, fade } = getMotionVariants(!!shouldReduceMotion);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>How It Works | SongIQ</title>
        <meta
          name="description"
          content="How SongIQ works: Solo, Daily Challenge, Multiplayer and Challenge links, plus how Points, streaks and the leaderboard are calculated."
        />
        <link rel="canonical" href="https://songiq.io/how-it-works" />
      </Helmet>
      <Starfield />
      <Header />

      <motion.main
        className="relative z-10 pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+100px)] pb-16 px-4 max-w-4xl mx-auto"
        initial="hidden"
        animate="show"
        variants={container(0.06)}
      >
        <motion.div variants={fade} className="text-center mb-14">
          <h1 className="glow-heading mb-3">How SongIQ Works</h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto">
            One core game, four ways to play it. Here's everything you need to jump in.
          </p>
        </motion.div>

        {/* The core loop */}
        <motion.section variants={fade} className="mb-16">
          <h2 className="font-display text-2xl text-center mb-6">Every round works the same way</h2>
          <div className="flex flex-col md:flex-row items-stretch gap-6 md:gap-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex items-center gap-3 flex-1">
                <motion.div variants={pop} className="raised-panel text-center p-6 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-display text-lg mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.desc}</p>
                </motion.div>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="hidden md:block w-6 h-6 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </motion.section>

        {/* The four modes */}
        <motion.section variants={fade} className="mb-16">
          <h2 className="font-display text-2xl text-center mb-6">Four ways to play</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {MODES.map((mode) => (
              <motion.div key={mode.title} variants={pop} className="raised-panel p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <mode.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg leading-tight">{mode.title}</h3>
                    <p className="text-xs text-muted-foreground">{mode.tagline}</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {mode.points.map((point) => (
                    <li key={point} className="text-sm text-foreground/80 flex gap-2">
                      <span className="text-primary shrink-0">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Points & scoring */}
        <motion.section variants={fade} className="mb-16">
          <div className="raised-panel p-6 md:p-8">
            <h2 className="font-display text-2xl mb-1 flex items-center gap-2">
              <Medal className="w-5 h-5 text-gold" /> Points &amp; scoring
            </h2>
            <p className="text-muted-foreground text-sm mb-4">
              Points are earned in every game you finish, and they never reset. They're your lifetime total.
            </p>
            <ul className="space-y-2">
              <li className="flex gap-2 text-sm text-foreground/90">
                <span className="text-gold font-bold shrink-0">+</span>
                Your game score ÷ 100, up to 20 Points per game
              </li>
              <li className="flex gap-2 text-sm text-foreground/90">
                <span className="text-gold font-bold shrink-0">+</span>
                Multiplayer: 5 extra Points for every opponent you beat in a room
              </li>
              <li className="flex gap-2 text-sm text-foreground/90">
                <span className="text-gold font-bold shrink-0">+</span>
                Daily Challenge top 3: 10 / 6 / 4 bonus Points once the day ends
              </li>
            </ul>
          </div>
        </motion.section>

        {/* Leaderboard */}
        <motion.section variants={fade} className="mb-16">
          <div className="raised-panel p-6 md:p-8">
            <h2 className="font-display text-2xl mb-1 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-gold" /> The leaderboard
            </h2>
            <p className="text-muted-foreground text-sm mb-4">
              Every mode counts toward one global leaderboard, rankable two ways:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-card/50 rounded-xl p-4">
                <p className="font-semibold text-foreground text-sm mb-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" /> Minutes played
                </p>
                <p className="text-sm text-muted-foreground">
                  Your total time in games across every mode, used as the default ranking.
                </p>
              </div>
              <div className="bg-card/50 rounded-xl p-4">
                <p className="font-semibold text-foreground text-sm mb-1 flex items-center gap-1.5">
                  <Medal className="w-4 h-4 text-primary" /> Points
                </p>
                <p className="text-sm text-muted-foreground">
                  Toggle to rank by lifetime Points instead. See "Points &amp; scoring" above.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              <span className="font-semibold text-foreground">Weekly</span> restarts every Sunday,{" "}
              <span className="font-semibold text-foreground">Monthly</span> restarts on the 1st, and{" "}
              <span className="font-semibold text-foreground">All-time</span> never resets.
            </p>
          </div>
        </motion.section>

        {/* Streaks */}
        <motion.section variants={fade} className="mb-16">
          <div className="raised-panel p-6 md:p-8">
            <h2 className="font-display text-2xl mb-1 flex items-center gap-2">
              <Flame className="w-5 h-5 text-kente-green" /> Daily streaks
            </h2>
            <p className="text-sm text-muted-foreground">
              Playing the Daily Challenge on consecutive days builds your streak, shown next to your name on the
              leaderboard. Miss a day and it resets to zero, so once you start one, keep it alive.
            </p>
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section variants={pop} className="text-center">
          <div className="raised-panel p-10 md:p-16">
            <h2 className="font-display text-2xl md:text-3xl mb-2">
              Ready to <span className="text-primary">play?</span>
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Free, no signup required. Jump in and start guessing.
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
      </motion.main>

      <SiteFooter />
    </div>
  );
}
