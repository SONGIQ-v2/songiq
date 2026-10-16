import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown, ArrowRight, CalendarDays, Check, Clock, Flame, Headphones, Link2, Medal, Play, RotateCcw,
  ShieldCheck, Timer, Trophy, Users, X, Zap,
} from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getMotionVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { PageSeo } from "@/components/PageSeo";

// Same rule as the game (calculatePoints in src/lib/spotify.ts and the
// multiplayer grader): 100 for a correct answer plus a speed bonus that
// drains from 100 to 0 across the round. Wrong or no answer: 0.
const ROUND_SECONDS = 15;
const pointsFor = (seconds: number) =>
  100 + Math.max(0, Math.floor(((ROUND_SECONDS - seconds) / ROUND_SECONDS) * 100));

const FACTS = [
  { value: "15s", label: "to name each song" },
  { value: "4", label: "choices per round" },
  { value: "200", label: "points max per song" },
  { value: "Free", label: "no sign-up needed" },
] as const;

const SPEED_EXAMPLES = [
  { seconds: 2, label: "Instant recognition", tone: "bg-gold" },
  { seconds: 7, label: "Took a moment", tone: "bg-gold/70" },
  { seconds: 14, label: "Beat the buzzer", tone: "bg-gold/45" },
] as const;

const MODES = [
  {
    icon: Headphones,
    title: "Solo",
    tagline: "Play anytime, as often as you like",
    points: [
      "Pick any genre, country chart or artist playlist",
      "10 songs per game, and you can replay as often as you like",
      "Every finished game becomes a challenge link for friends",
    ],
    cta: { label: "Browse playlists", to: "/solo" },
  },
  {
    icon: CalendarDays,
    title: "Daily Challenge",
    tagline: "Same 10 songs for everyone, once a day",
    points: [
      "One attempt per day, with new songs at midnight (Lagos time)",
      "Closed it by accident? Your answers are saved, continue until midnight",
      "Play daily to build a streak; the top 3 earn bonus Points",
    ],
    cta: { label: "Play today's challenge", to: "/daily" },
  },
  {
    icon: Users,
    title: "Multiplayer",
    tagline: "Live rooms with friends, up to 25 players",
    points: [
      "Create a room and share the link so friends can join from any device",
      "The host picks the playlist, 5–20 songs and 10–30s per song",
      "Everyone hears each clip at the same moment and races to answer",
    ],
    cta: { label: "Start a room", to: "/multiplayer" },
  },
  {
    icon: Link2,
    title: "Challenges",
    tagline: "Your exact game, sent to a friend",
    points: [
      "Friends play the identical songs you did and try to beat you",
      "A live board shows everyone who's taken your challenge",
      "Browse open challenges from other players and beat their scores",
    ],
    cta: { label: "Browse challenges", to: "/challenges" },
  },
] as const;

const FAQ = [
  {
    q: "Do I need to sign up to play?",
    a: "No. You can play every mode straight away with just a nickname. Signing in with Google is optional, but it keeps your Points, streak and nickname safe across devices.",
  },
  {
    q: "Are these the real songs?",
    a: "Yes. Every round plays an official preview of the actual track, not a cover or a remake.",
  },
  {
    q: "When does the Daily Challenge reset?",
    a: "Every day at midnight Lagos time (WAT, UTC+1). Everyone gets the same 10 songs, and only your first attempt counts.",
  },
  {
    q: "What happens if I close the Daily halfway through?",
    a: "Every answer is saved as you go. Open the Daily again before midnight and you'll continue from the next song. If you don't come back, your score so far counts and shows as incomplete.",
  },
  {
    q: "Can I replay a playlist?",
    a: "In Solo, as often as you like, and the songs are reshuffled each time. The Daily Challenge and challenge links are one attempt each.",
  },
  {
    q: "How many people can play multiplayer?",
    a: "Up to 25 per room. Share the room link and anyone can join from a phone, tablet or computer, with no app needed.",
  },
] as const;

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

export default function HowItWorks() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { container, pop, fade } = getMotionVariants(!!shouldReduceMotion);
  const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.15 } } as const;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <PageSeo path="/how-it-works" />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(FAQ_JSON_LD)}</script>
      </Helmet>
      <Starfield />
      <Header />

      <main className="relative z-10 pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+90px)] pb-16 px-4 max-w-5xl mx-auto">
        {/* Hero */}
        <motion.section className="text-center mb-20" initial="hidden" animate="show" variants={container(0.08)}>
          <motion.p variants={fade} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold text-[11px] font-bold uppercase tracking-[0.15em] mb-5">
            <Zap className="w-3.5 h-3.5" /> The SongIQ playbook
          </motion.p>
          <motion.h1 variants={fade} className="glow-heading mb-4">How SongIQ Works</motion.h1>
          <motion.p variants={fade} className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto mb-8">
            Hear a clip, name the song or artist, and score more the faster you are. Here's everything you
            need, or try a practice round right on this page.
          </motion.p>
          <motion.div variants={fade} className="flex flex-wrap justify-center gap-3 mb-12">
            <Button variant="gold" size="lg" className="rounded-full" onClick={() => navigate("/solo")}>
              <Play className="w-4 h-4 mr-1.5 fill-current" /> Play now
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full"
              onClick={() => document.getElementById("try-a-round")?.scrollIntoView({ behavior: "smooth" })}
            >
              Try a practice round <ArrowDown className="w-4 h-4 ml-1.5" />
            </Button>
          </motion.div>
          <motion.dl variants={container(0.06)} className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {FACTS.map((f) => (
              <motion.div key={f.label} variants={pop} className="raised-panel py-4 px-3">
                <dt className="sr-only">{f.label}</dt>
                <dd className="font-display text-3xl text-gold leading-none mb-1.5">{f.value}</dd>
                <dd className="text-[11px] uppercase tracking-wider text-muted-foreground">{f.label}</dd>
              </motion.div>
            ))}
          </motion.dl>
        </motion.section>

        {/* The core loop, with a small visual of each step */}
        <motion.section {...inView} variants={container(0.08)} className="mb-20">
          <motion.h2 variants={fade} className="font-display text-3xl text-center mb-2">Every round in 3 steps</motion.h2>
          <motion.p variants={fade} className="text-muted-foreground text-sm text-center mb-8">
            Solo, Daily, Multiplayer and Challenges all play exactly like this.
          </motion.p>
          <div className="grid md:grid-cols-3 gap-4">
            <StepCard variants={pop} n={1} title="Listen" desc="A 15-second clip of a real song starts playing. The clock starts with it.">
              <div className="rounded-xl bg-background/60 border border-border p-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Headphones className="w-3.5 h-3.5 text-primary" /> Song 4 of 10
                  </span>
                  <span className="font-bold text-gold tabular-nums">0:09 left</span>
                </div>
                <div className="flex items-end justify-between h-10 mb-2 px-0.5" aria-hidden="true">
                  {[0.45, 0.8, 0.6, 1, 0.7, 0.4, 0.9, 0.65, 0.5, 0.85, 0.55, 0.75, 0.95, 0.5, 0.7, 0.6].map((h, i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 rounded-full bg-primary/80 origin-bottom"
                      style={{ height: `${Math.round(h * 40)}px` }}
                      animate={shouldReduceMotion ? undefined : { scaleY: [1, 0.55, 1] }}
                      transition={{ duration: 0.8 + (i % 5) * 0.14, repeat: Infinity, ease: "easeInOut" }}
                    />
                  ))}
                </div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div className="h-full w-[60%] bg-gold rounded-full" />
                </div>
              </div>
            </StepCard>
            <StepCard variants={pop} n={2} title="Pick fast" desc="Guess the song title or the artist from 4 choices. Your first tap is locked in.">
              <div className="grid grid-cols-2 gap-1.5 text-xs" aria-hidden="true">
                {["Ye", "Last Last", "Anybody", "Gbona"].map((o) => (
                  <span
                    key={o}
                    className={cn(
                      "rounded-lg px-2.5 py-2 border font-semibold truncate",
                      o === "Last Last"
                        ? "bg-kente-green/20 border-kente-green text-kente-green flex items-center justify-between"
                        : "bg-background/60 border-border text-foreground/70"
                    )}
                  >
                    {o}
                    {o === "Last Last" && <Check className="w-3.5 h-3.5" />}
                  </span>
                ))}
              </div>
            </StepCard>
            <StepCard variants={pop} n={3} title="Score" desc="Right answers earn 100 points plus a speed bonus. After 10 songs, see your full breakdown.">
              <div className="rounded-xl bg-background/60 border border-border p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Answered in 3.9s</p>
                  <p className="font-display text-3xl text-gold leading-tight">+{pointsFor(3.9)}</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gold/15 text-gold">100 + {pointsFor(3.9) - 100} speed</span>
              </div>
            </StepCard>
          </div>
        </motion.section>

        {/* Scoring, shown with real numbers */}
        <motion.section {...inView} variants={container(0.08)} className="mb-20">
          <div className="raised-panel p-6 md:p-10">
            <motion.h2 variants={fade} className="font-display text-3xl mb-2 flex items-center gap-2">
              <Timer className="w-6 h-6 text-gold" /> Speed is everything
            </motion.h2>
            <motion.p variants={fade} className="text-muted-foreground text-sm mb-8 max-w-2xl">
              A correct answer is worth <span className="text-foreground font-semibold">100 points</span>, plus a{" "}
              <span className="text-foreground font-semibold">speed bonus of up to 100</span> that drains every
              moment until the 15 seconds run out. A wrong answer or no answer scores 0.
            </motion.p>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {SPEED_EXAMPLES.map((ex) => {
                const pts = pointsFor(ex.seconds);
                return (
                  <motion.div key={ex.seconds} variants={pop} className="rounded-xl bg-background/60 border border-border p-5">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-semibold text-muted-foreground">{ex.label}</span>
                      <span className="text-xs font-bold text-foreground tabular-nums">{ex.seconds}s</span>
                    </div>
                    <p className="font-display text-4xl text-foreground tabular-nums mb-3">
                      {pts} <span className="text-sm text-muted-foreground">pts</span>
                    </p>
                    <div className="h-2 rounded-full bg-border overflow-hidden" aria-hidden="true">
                      <div className={cn("h-full rounded-full", ex.tone)} style={{ width: `${(pts / 200) * 100}%` }} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <motion.p variants={fade} className="text-xs text-muted-foreground">
              Multiplayer hosts can set 10–30 seconds per song, and the bonus drains over whatever time the room uses.
            </motion.p>
          </div>
        </motion.section>

        {/* Interactive practice round */}
        <motion.section {...inView} variants={container(0.08)} className="mb-20 scroll-mt-28" id="try-a-round">
          <motion.h2 variants={fade} className="font-display text-3xl text-center mb-2">Try a practice round</motion.h2>
          <motion.p variants={fade} className="text-muted-foreground text-sm text-center mb-8">
            There's no audio here, so just read the clue and tap fast. It's scored exactly like the real game.
          </motion.p>
          <motion.div variants={pop}>
            <PracticeRound />
          </motion.div>
        </motion.section>

        {/* Modes */}
        <motion.section {...inView} variants={container(0.08)} className="mb-20">
          <motion.h2 variants={fade} className="font-display text-3xl text-center mb-2">Four ways to play</motion.h2>
          <motion.p variants={fade} className="text-muted-foreground text-sm text-center mb-8">
            Same game, different stakes. Pick the one that fits your mood.
          </motion.p>
          <div className="grid sm:grid-cols-2 gap-4">
            {MODES.map((mode) => (
              <motion.div key={mode.title} variants={pop} className="raised-panel p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <mode.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl leading-tight">{mode.title}</h3>
                    <p className="text-xs text-muted-foreground">{mode.tagline}</p>
                  </div>
                </div>
                <ul className="space-y-2 mb-5 flex-1">
                  {mode.points.map((point) => (
                    <li key={point} className="text-sm text-foreground/85 flex gap-2">
                      <Check className="w-4 h-4 text-kente-green shrink-0 mt-0.5" />
                      {point}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate(mode.cta.to)}
                  className="self-start text-sm font-bold text-gold hover:underline inline-flex items-center gap-1"
                >
                  {mode.cta.label} <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Points, leaderboard, streaks */}
        <motion.section {...inView} variants={container(0.08)} className="mb-20">
          <motion.h2 variants={fade} className="font-display text-3xl text-center mb-8">Climb the leaderboard</motion.h2>
          <div className="grid md:grid-cols-3 gap-4">
            <motion.div variants={pop} className="raised-panel p-6">
              <h3 className="font-display text-xl mb-1 flex items-center gap-2">
                <Medal className="w-5 h-5 text-gold" /> Points
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Earned in every game you finish. They never reset.</p>
              <ul className="space-y-2.5 text-sm text-foreground/90">
                <li className="flex gap-2"><span className="text-gold font-bold">+</span>Your game score ÷ 100 (up to 20 for a 10-song game)</li>
                <li className="flex gap-2"><span className="text-gold font-bold">+5</span>for every opponent you beat in a multiplayer room</li>
                <li className="flex gap-2"><span className="text-gold font-bold">+10/6/4</span>for the Daily Challenge top 3 when the day ends</li>
              </ul>
            </motion.div>
            <motion.div variants={pop} className="raised-panel p-6">
              <h3 className="font-display text-xl mb-1 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-gold" /> Leaderboard
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Every mode counts toward one global board.</p>
              <ul className="space-y-2.5 text-sm text-foreground/90">
                <li className="flex gap-2"><Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />Ranked by minutes played, or switch to Points</li>
                <li className="flex gap-2"><CalendarDays className="w-4 h-4 text-primary shrink-0 mt-0.5" />Weekly restarts Sunday, Monthly on the 1st</li>
                <li className="flex gap-2"><Trophy className="w-4 h-4 text-primary shrink-0 mt-0.5" />All-time never resets</li>
              </ul>
            </motion.div>
            <motion.div variants={pop} className="raised-panel p-6">
              <h3 className="font-display text-xl mb-1 flex items-center gap-2">
                <Flame className="w-5 h-5 text-kente-green" /> Streaks
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Play the Daily on consecutive days to build one.</p>
              <ul className="space-y-2.5 text-sm text-foreground/90">
                <li className="flex gap-2"><Flame className="w-4 h-4 text-kente-green shrink-0 mt-0.5" />Shown next to your name on the leaderboard</li>
                <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-kente-green shrink-0 mt-0.5" />Every 15 days earns a Streak Save that covers one missed day</li>
                <li className="flex gap-2"><Link2 className="w-4 h-4 text-kente-green shrink-0 mt-0.5" />Lost it? Get friends to play your challenge link to win it back</li>
              </ul>
            </motion.div>
          </div>
        </motion.section>

        {/* FAQ */}
        <motion.section {...inView} variants={container(0.06)} className="mb-20 max-w-3xl mx-auto">
          <motion.h2 variants={fade} className="font-display text-3xl text-center mb-6">Questions</motion.h2>
          <motion.div variants={fade}>
            <Accordion type="single" collapsible className="space-y-3">
              {FAQ.map((f, i) => (
                <AccordionItem key={f.q} value={`q${i}`} className="raised-panel px-5 border-b-0">
                  <AccordionTrigger className="text-left font-semibold hover:no-underline">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </motion.section>

        {/* CTA */}
        <motion.section {...inView} variants={pop} className="text-center">
          <div className="raised-panel p-10 md:p-16">
            <h2 className="font-display text-2xl md:text-3xl mb-2">
              Ready to <span className="text-primary">play?</span>
            </h2>
            <p className="text-muted-foreground text-sm mb-6">Free, no sign-up required. Jump in and start guessing.</p>
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
      </main>

      <SiteFooter />
    </div>
  );
}

function StepCard({
  n, title, desc, children, variants,
}: {
  n: number;
  title: string;
  desc: string;
  children: React.ReactNode;
  variants: import("framer-motion").Variants;
}) {
  return (
    <motion.div variants={variants} className="raised-panel p-6 flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-full bg-gold text-background font-display text-lg flex items-center justify-center shrink-0">
          {n}
        </span>
        <h3 className="font-display text-xl">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-5 flex-1">{desc}</p>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Practice round: no audio, a text clue instead -- scored with the real rule.
// ---------------------------------------------------------------------------

const PRACTICE = [
  { clue: "Who sang “Last Last”?", answer: "Burna Boy", options: ["Wizkid", "Burna Boy", "Davido", "Rema"] },
  { clue: "Who sang “Calm Down”?", answer: "Rema", options: ["Rema", "Asake", "Fireboy DML", "Omah Lay"] },
  { clue: "Which of these is a Tems song?", answer: "Free Mind", options: ["Joha", "Free Mind", "Love Nwantiti", "Unavailable"] },
  { clue: "Who sang “Essence”?", answer: "Wizkid", options: ["Tiwa Savage", "Kizz Daniel", "Wizkid", "Burna Boy"] },
  { clue: "Who sang “Water”?", answer: "Tyla", options: ["Tyla", "Ayra Starr", "Tems", "Yemi Alade"] },
] as const;

type PracticeState =
  | { phase: "ready" }
  | { phase: "playing"; startedAt: number }
  | { phase: "done"; picked: string | null; seconds: number };

function PracticeRound() {
  const [qIndex, setQIndex] = useState(0);
  const [state, setState] = useState<PracticeState>({ phase: "ready" });
  const [elapsed, setElapsed] = useState(0);
  const raf = useRef<number | null>(null);
  const q = PRACTICE[qIndex];

  useEffect(() => {
    if (state.phase !== "playing") return;
    const tick = () => {
      const s = (performance.now() - state.startedAt) / 1000;
      if (s >= ROUND_SECONDS) {
        setElapsed(ROUND_SECONDS);
        setState({ phase: "done", picked: null, seconds: ROUND_SECONDS });
        return;
      }
      setElapsed(s);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [state]);

  const start = () => {
    setElapsed(0);
    setState({ phase: "playing", startedAt: performance.now() });
  };
  const pick = (option: string) => {
    if (state.phase !== "playing") return;
    const seconds = (performance.now() - state.startedAt) / 1000;
    setElapsed(seconds);
    setState({ phase: "done", picked: option, seconds });
  };
  const next = () => {
    setQIndex((i) => (i + 1) % PRACTICE.length);
    setState({ phase: "ready" });
    setElapsed(0);
  };

  const done = state.phase === "done";
  const correct = done && state.picked === q.answer;
  const points = done && correct ? pointsFor(state.seconds) : 0;
  const left = Math.max(0, ROUND_SECONDS - elapsed);

  return (
    <div className="raised-panel p-5 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Practice · {qIndex + 1}/{PRACTICE.length}
        </span>
        <span className={cn("text-sm font-bold tabular-nums", left <= 5 && state.phase === "playing" ? "text-destructive" : "text-gold")}>
          {left.toFixed(1)}s
        </span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden mb-6" aria-hidden="true">
        <div
          className="h-full bg-gold rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${(left / ROUND_SECONDS) * 100}%` }}
        />
      </div>

      {state.phase === "ready" ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground text-sm mb-4">The clock starts when you tap, so answer as fast as you can.</p>
          <Button variant="gold" size="lg" className="rounded-full" onClick={start}>
            <Play className="w-4 h-4 mr-1.5 fill-current" /> Start the clock
          </Button>
        </div>
      ) : (
        <>
          <p className="font-display text-2xl text-center mb-5">{q.clue}</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {q.options.map((o) => {
              const isAnswer = o === q.answer;
              const isPicked = done && state.picked === o;
              return (
                <button
                  key={o}
                  onClick={() => pick(o)}
                  disabled={done}
                  className={cn(
                    "rounded-xl border-2 px-4 py-3.5 text-sm font-bold text-left transition-colors flex items-center justify-between gap-2",
                    !done && "border-border bg-background/60 hover:border-gold hover:bg-gold/10",
                    done && isAnswer && "border-kente-green bg-kente-green/15 text-kente-green",
                    done && isPicked && !isAnswer && "border-destructive bg-destructive/15 text-destructive",
                    done && !isAnswer && !isPicked && "border-border bg-background/40 opacity-60"
                  )}
                >
                  {o}
                  {done && isAnswer && <Check className="w-4 h-4 shrink-0" />}
                  {done && isPicked && !isAnswer && <X className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
          {done && (
            <div className="rounded-xl bg-background/60 border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" aria-live="polite">
              <div>
                <p className="font-display text-3xl text-gold leading-tight">+{points} pts</p>
                <p className="text-sm text-muted-foreground">
                  {state.picked === null
                    ? "Time ran out. No answer scores 0."
                    : correct
                    ? `Correct in ${state.seconds.toFixed(1)}s: 100 + ${points - 100} speed bonus.`
                    : `Not quite. It was ${q.answer}, and wrong answers score 0.`}
                </p>
              </div>
              <Button variant="outline" onClick={next} className="shrink-0">
                <RotateCcw className="w-4 h-4 mr-1.5" /> Next question
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
