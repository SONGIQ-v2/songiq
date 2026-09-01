import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Play, Users } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>Page Not Found (404) | SongIQ</title>
        <meta name="description" content="The page you're looking for doesn't exist. Head back to SongIQ to play the music quiz." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href={`https://songiq.io${location.pathname}`} />
        <meta property="og:title" content="Page Not Found (404) | SongIQ" />
        <meta property="og:description" content="The page you're looking for doesn't exist on SongIQ." />
        <meta property="og:url" content={`https://songiq.io${location.pathname}`} />
      </Helmet>
      <Starfield />
      <Header />

      <main className="relative z-10 min-h-screen flex items-center justify-center px-4 pt-[var(--header-height)]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="raised-panel p-10 md:p-14 text-center max-w-lg w-full"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-5">
            <Music2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl md:text-4xl mb-2">404</h1>
          <p className="text-foreground font-semibold mb-1">That track isn't in our catalog</p>
          <p className="text-muted-foreground text-sm mb-8">
            The page you're looking for doesn't exist, or it moved. Let's get you back in the game.
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

          <p className="mt-6 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground underline underline-offset-4">
              ← Back to SongIQ home
            </Link>
          </p>
        </motion.div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default NotFound;
