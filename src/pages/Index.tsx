import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { GameModeCard } from "@/components/GameModeCard";
import { Music, Users, Headphones, Mic2, Trophy, Zap, CalendarDays, ChevronRight } from "lucide-react";
import { fetchTodayChallenge, type DailyChallenge } from "@/lib/daily";

const Index = () => {
  const navigate = useNavigate();
  const [daily, setDaily] = useState<DailyChallenge | null>(null);

  useEffect(() => {
    fetchTodayChallenge().then(setDaily).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Starfield />
      <Header />

      <main className="relative z-10 pt-24 pb-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="font-display text-4xl md:text-6xl uppercase tracking-wide mb-4">
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
              className="w-full max-w-2xl mx-auto mb-6 flex items-center justify-between gap-3 px-5 py-4 rounded-2xl border-2 border-gold/50 bg-gold/10 hover:bg-gold/20 transition-colors text-left"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <span className="flex items-center gap-3">
                <CalendarDays className="w-8 h-8 text-gold shrink-0" />
                <span>
                  <span className="block font-display uppercase tracking-wide text-foreground">
                    Daily Challenge #{daily.number}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {daily.category_name} · same 10 songs for everyone · one attempt
                  </span>
                </span>
              </span>
              <ChevronRight className="w-6 h-6 text-gold shrink-0" />
            </motion.button>
          )}

          {/* Game Mode Cards */}
          <motion.div
            className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <GameModeCard
              title="Solo Music Quiz"
              description="Guess the song & artist — play at your own pace"
              icon="solo"
              onClick={() => navigate("/solo")}
              isPrimary
            />
            <GameModeCard
              title="Multiplayer Challenge"
              description="Challenge friends in real-time music trivia"
              icon="multiplayer"
              onClick={() => navigate("/multiplayer")}
            />
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            className="flex justify-center gap-8 text-center mb-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div>
              <div className="text-2xl font-bold text-primary">8+</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Genres</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">1000+</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Songs</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">∞</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Fun</div>
            </div>
          </motion.div>

          {/* How It Works Section */}
          <motion.section
            className="mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h2 className="font-display text-2xl md:text-3xl uppercase tracking-wide text-center mb-8">
              How to <span className="text-primary">Play</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <div className="text-center p-6 rounded-2xl bg-card/50 border border-border/50">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
                  <Headphones className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display text-lg uppercase mb-2">Listen</h3>
                <p className="text-muted-foreground text-sm">Hear a short clip from a trending song</p>
              </div>
              <div className="text-center p-6 rounded-2xl bg-card/50 border border-border/50">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
                  <Mic2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display text-lg uppercase mb-2">Guess</h3>
                <p className="text-muted-foreground text-sm">Pick the correct song title or artist name</p>
              </div>
              <div className="text-center p-6 rounded-2xl bg-card/50 border border-border/50">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display text-lg uppercase mb-2">Win</h3>
                <p className="text-muted-foreground text-sm">Score points, climb the leaderboard & flex your IQ</p>
              </div>
            </div>
          </motion.section>

          {/* Genre Highlights */}
          <motion.section
            className="mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <h2 className="font-display text-2xl md:text-3xl uppercase tracking-wide text-center mb-8">
              African Music <span className="text-primary">Genres</span> We Cover
            </h2>
            <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
              {["Afrobeats", "Amapiano", "Highlife", "Bongo Flava", "Afro-Pop", "Naija Hits", "Gospel", "Hip-Hop"].map((genre) => (
                <span
                  key={genre}
                  className="px-4 py-2 rounded-full bg-card/60 border border-border/50 text-sm text-foreground/80 font-medium"
                >
                  {genre}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground text-sm text-center mt-4 max-w-xl mx-auto">
              From Burna Boy to Wizkid, Tems to Asake — guess the song from today's hottest African artists and classic throwbacks.
            </p>
          </motion.section>

          {/* CTA Section */}
          <motion.section
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <div className="p-8 rounded-3xl bg-card/40 border border-border/50 max-w-xl mx-auto">
              <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
              <h2 className="font-display text-xl md:text-2xl uppercase tracking-wide mb-2">
                Ready to Play?
              </h2>
              <p className="text-muted-foreground text-sm mb-6">
                No sign-up needed. Jump straight into the music quiz and start guessing songs now — it's free!
              </p>
              <motion.button
                onClick={() => navigate("/solo")}
                className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-display uppercase tracking-wide hover:bg-primary/90 transition-colors"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Start Guessing Songs
              </motion.button>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
};

export default Index;
