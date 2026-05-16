import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { PlaylistCard } from "@/components/PlaylistCard";
import { Button } from "@/components/ui/button";
import { PLAYLISTS, PLAYLIST_CATEGORIES, type PlaylistCategory } from "@/lib/playlists";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic } from "@/hooks/useAppleMusic";
import { ArrowLeft, Play, Loader2 } from "lucide-react";

const SoloPlay = () => {
  const navigate = useNavigate();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(PLAYLISTS[0]?.id || "");
  const [playlistImages, setPlaylistImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState(true);
  const [activeCategory, setActiveCategory] = useState<"all" | PlaylistCategory>("all");
  const { setCategory } = useGameStore();
  const { getPlaylistTracks } = useAppleMusic();

  const visiblePlaylists = activeCategory === "all"
    ? PLAYLISTS
    : PLAYLISTS.filter((p) => p.category === activeCategory);

  // Fetch playlist images on mount
  useEffect(() => {
    const fetchPlaylistImages = async () => {
      setLoadingImages(true);
      const images: Record<string, string> = {};
      
      // Fetch first playlist's image to show quickly
      const firstPlaylist = PLAYLISTS[0];
      if (firstPlaylist) {
        const result = await getPlaylistTracks(
          firstPlaylist.searchTerms,
          firstPlaylist.name,
          5
        );
        if (result?.playlistImage) {
          images[firstPlaylist.id] = result.playlistImage;
          setPlaylistImages({ ...images });
        }
      }
      
      // Fetch remaining playlist images in background
      for (const playlist of PLAYLISTS.slice(1)) {
        const result = await getPlaylistTracks(
          playlist.searchTerms,
          playlist.name,
          5
        );
        if (result?.playlistImage) {
          images[playlist.id] = result.playlistImage;
          setPlaylistImages({ ...images });
        }
      }
      
      setLoadingImages(false);
    };

    fetchPlaylistImages();
  }, [getPlaylistTracks]);

  const handlePlay = () => {
    setCategory(selectedPlaylistId);
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
              Select a playlist to start your music quiz
            </p>
          </motion.div>

          {/* Category Tabs */}
          <motion.div
            className="flex flex-wrap justify-center gap-2 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            {PLAYLIST_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium uppercase tracking-wide transition-all border",
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                    : "bg-card/40 text-muted-foreground border-border/40 hover:text-foreground hover:border-border"
                )}
              >
                {cat.label}
              </button>
            ))}
          </motion.div>

          {/* Playlists Grid */}
          <motion.div
            key={activeCategory}
            className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {visiblePlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                imageUrl={playlistImages[playlist.id]}
                isSelected={selectedPlaylistId === playlist.id}
                onClick={() => setSelectedPlaylistId(playlist.id)}
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
            <Button 
              variant="gold" 
              size="xl" 
              onClick={handlePlay}
              disabled={!selectedPlaylistId}
            >
              {loadingImages ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Play className="w-5 h-5 mr-2 fill-current" />
              )}
              Start Quiz
            </Button>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default SoloPlay;
