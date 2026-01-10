import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { CategoryCard } from "@/components/CategoryCard";
import { Button } from "@/components/ui/button";
import { AFRICAN_CATEGORIES, CategoryKey } from "@/lib/spotify";
import { useGameStore } from "@/lib/gameStore";
import { ArrowLeft, Play } from "lucide-react";

const SoloPlay = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("afrobeats");
  const { setCategory } = useGameStore();

  const handlePlay = () => {
    setCategory(selectedCategory);
    navigate("/solo/game");
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Starfield />
      <Header />

      <main className="relative z-10 pt-24 pb-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Back button */}
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {/* Title */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="font-display text-3xl md:text-4xl uppercase tracking-wide mb-2">
              Choose Your Vibe
            </h1>
            <p className="text-muted-foreground">
              Select a category to start your music quiz
            </p>
          </motion.div>

          {/* Categories Grid */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {(Object.keys(AFRICAN_CATEGORIES) as CategoryKey[]).map((key) => (
              <CategoryCard
                key={key}
                categoryKey={key}
                isSelected={selectedCategory === key}
                onClick={() => setSelectedCategory(key)}
              />
            ))}
          </motion.div>

          {/* Play Button */}
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Button variant="gold" size="xl" onClick={handlePlay}>
              <Play className="w-5 h-5 mr-2 fill-current" />
              Start Quiz
            </Button>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default SoloPlay;
