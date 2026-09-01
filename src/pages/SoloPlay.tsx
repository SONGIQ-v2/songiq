import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { PlaylistCard } from "@/components/PlaylistCard";
import { DoubleTapHint } from "@/components/DoubleTapHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLAYLISTS, PLAYLIST_CATEGORIES, getPlaylistById, type PlaylistCategory } from "@/lib/playlists";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/lib/gameStore";
import { useAppleMusic } from "@/hooks/useAppleMusic";
import { getMotionVariants } from "@/lib/motion";
import { trackEvent } from "@/lib/analytics";
import { ArrowLeft, Play, Loader2, Search } from "lucide-react";

const SoloPlay = () => {
  const navigate = useNavigate();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(PLAYLISTS[0]?.id || "");
  const [playlistImages, setPlaylistImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState(true);
  const [activeCategory, setActiveCategory] = useState<"all" | PlaylistCategory>("all");
  // Sub-filter within the active main category — not a category of its own.
  const [artistsOnly, setArtistsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { setCategory } = useGameStore();
  const { getPlaylistTracks } = useAppleMusic();
  const shouldReduceMotion = useReducedMotion();
  const { container, pop, fade } = getMotionVariants(!!shouldReduceMotion);

  const categoryPlaylists = activeCategory === "all"
    ? PLAYLISTS
    : PLAYLISTS.filter((p) => p.category === activeCategory);
  const hasArtistsInCategory = categoryPlaylists.some((p) => p.isArtist);
  const filteredPlaylists = artistsOnly
    ? categoryPlaylists.filter((p) => p.isArtist)
    : categoryPlaylists;
  const query = searchQuery.trim().toLowerCase();
  const visiblePlaylists = query
    ? filteredPlaylists.filter((p) => p.name.toLowerCase().includes(query))
    : filteredPlaylists;

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
          5,
          firstPlaylist.isArtist
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
          5,
          playlist.isArtist
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

  const startQuiz = (playlistId: string) => {
    setCategory(playlistId);
    trackEvent("solo_game_start", {
      playlist_id: playlistId,
      playlist_name: getPlaylistById(playlistId)?.name,
    });
    navigate("/solo/game");
  };

  const handlePlay = () => startQuiz(selectedPlaylistId);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Helmet>
        <title>Solo Play — Pick a Playlist & Start the Quiz | SongIQ</title>
        <meta name="description" content="Play SongIQ solo. Pick a genre — Afrobeats, Amapiano, Hip-Hop, Pop and more — and guess the song or artist in 15 seconds." />
        <link rel="canonical" href="https://songiq.io/solo" />
        <meta property="og:title" content="SongIQ Solo Play — Pick a Playlist & Start the Quiz" />
        <meta property="og:description" content="Play SongIQ solo. Pick a genre and guess the song or artist in 15 seconds." />
        <meta property="og:url" content="https://songiq.io/solo" />
      </Helmet>
      <Starfield />
      <Header />

      <main className="relative z-10 pt-[var(--header-height)] pb-12 px-4">
        <motion.div className="max-w-[1400px] mx-auto" variants={container(0.1)} initial="hidden" animate="show">
          {/* Back button */}
          <motion.div variants={fade}>
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="mb-6"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </motion.div>

          {/* Title + search — heading left, search right on desktop; stacked/centered on mobile */}
          <motion.div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6" variants={fade}>
            <div className="text-center md:text-left">
              <h1 className="font-display text-4xl md:text-6xl mb-2">
                Browse All <span className="text-primary">Playlists</span>
              </h1>
              <p className="text-muted-foreground">
                Select a playlist to start your music quiz
              </p>
            </div>

            <div className="relative w-full max-w-xs mx-auto md:mx-0 md:mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search playlists…"
                aria-label="Search playlists"
                className="pl-9"
              />
            </div>
          </motion.div>

          <motion.div className="border-t border-white/15 mb-6" variants={fade} />

          {/* Category Tabs */}
          <motion.div className="flex flex-wrap justify-center md:justify-start gap-2 mb-6" variants={fade}>
            {PLAYLIST_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setArtistsOnly(false);
                }}
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

          {/* Sub-filter: only artist spotlights within the active category */}
          {hasArtistsInCategory && (
            <motion.div className="flex justify-center md:justify-start gap-2 mb-6" variants={fade}>
              <button
                onClick={() => setArtistsOnly(false)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
                  !artistsOnly ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                onClick={() => setArtistsOnly(true)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
                  artistsOnly ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Artists
              </button>
            </motion.div>
          )}

          <DoubleTapHint />

          {/* Playlists Grid */}
          {visiblePlaylists.length === 0 ? (
            <p className="text-center text-muted-foreground mb-8">
              No playlists match "{searchQuery.trim()}"
            </p>
          ) : (
            <motion.div
              key={activeCategory}
              className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-8"
              variants={container(0.05)}
              initial="hidden"
              animate="show"
            >
              {visiblePlaylists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  variants={pop}
                  playlist={playlist}
                  imageUrl={playlistImages[playlist.id]}
                  isSelected={selectedPlaylistId === playlist.id}
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  onDoubleClick={() => {
                    setSelectedPlaylistId(playlist.id);
                    startQuiz(playlist.id);
                  }}
                />
              ))}
            </motion.div>
          )}

          {/* Play Button */}
          <motion.div className="flex justify-center" variants={pop}>
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
        </motion.div>
      </main>
    </div>
  );
};

export default SoloPlay;
