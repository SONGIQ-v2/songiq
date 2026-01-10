import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { GameModeCard } from "@/components/GameModeCard";
import { Button } from "@/components/ui/button";
import { Music, Users } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

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
              Test Your <span className="text-primary">African</span> Music IQ
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              From Afrobeats to Amapiano, challenge yourself with the sounds of Africa
            </p>
          </motion.div>

          {/* Game Mode Cards */}
          <motion.div
            className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <GameModeCard
              title="Music Quiz"
              description="Test your music knowledge solo"
              icon="solo"
              onClick={() => navigate("/solo")}
              isPrimary
            />
            <GameModeCard
              title="Play with Friends"
              description="Challenge friends in live quizzes"
              icon="multiplayer"
              onClick={() => navigate("/multiplayer")}
            />
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            className="flex justify-center gap-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div>
              <div className="text-2xl font-bold text-primary">8+</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Categories</div>
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
        </div>
      </main>
    </div>
  );
};

export default Index;
