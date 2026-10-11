import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Starfield } from "@/components/Starfield";
import { SiteFooter } from "@/components/SiteFooter";
import { Header } from "@/components/Header";
import { ActiveChallengesSection, BattlefieldSection, DailyChallengeSection } from "@/components/HomeSections";
import { Button } from "@/components/ui/button";
import { getMotionVariants } from "@/lib/motion";
import { Headphones, Mic2, Trophy, Play, Users, ChevronRight } from "lucide-react";

const HOW_TO_PLAY = [
  { icon: Headphones, title: "Listen to the Clip", desc: "Hear a snippet of a hit track from your favorite genre." },
  { icon: Mic2, title: "Guess the Song", desc: "Search for the artist or title as fast as you can." },
  { icon: Trophy, title: "Prove Your IQ", desc: "Score points for speed and accuracy to climb the leaderboard." },
] as const;

const Index = () => {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { container, pop, fade } = getMotionVariants(!!shouldReduceMotion);

  // Client-side navigation to /#how-to-play (Header nav) doesn't scroll to
  // the hash on its own -- react-router leaves that to us
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, [location.hash]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Starfield />
      <Header />

      <main className="relative z-10 pt-[calc(var(--header-height)+50px)] md:pt-[calc(var(--header-height)+100px)] pb-12 px-4">
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

          {/* Live sections, shared with the SEO landing pages (HomeSections.tsx) */}
          <DailyChallengeSection />
          <BattlefieldSection />
          <ActiveChallengesSection />

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
