import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Play, Swords, Clock, Hash } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import songiqLogo from "@/assets/songiq-logo.png";
import { useGameStore } from "@/lib/gameStore";
import { fetchChallenge, type Challenge } from "@/lib/challenges";

export default function ChallengePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const initializeAuth = useGameStore((s) => s.initializeAuth);

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");

  useEffect(() => {
    (async () => {
      await initializeAuth();
      const c = code ? await fetchChallenge(code) : null;
      if (c) {
        setChallenge(c);
        setStatus("ready");
      } else {
        setStatus("not_found");
      }
    })();
  }, [code, initializeAuth]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      <Helmet>
        <title>Music Challenge — Beat My Score | SongIQ</title>
        <meta name="description" content="A friend challenged you to a music quiz on SongIQ. Same songs, same options — can you beat their score?" />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <Starfield />

      {status === "loading" && (
        <div className="text-center z-10">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 mx-auto mb-4"
          >
            <Music2 className="w-full h-full text-gold" />
          </motion.div>
          <p className="text-xl text-foreground/80">Loading challenge...</p>
        </div>
      )}

      {status === "not_found" && (
        <div className="text-center z-10 max-w-md">
          <p className="text-2xl font-bold text-foreground mb-2">Challenge not found</p>
          <p className="text-muted-foreground mb-6">
            This challenge link has expired or doesn't exist. Start your own game instead!
          </p>
          <Button variant="gold" size="lg" onClick={() => navigate("/")}>
            Play SongIQ
          </Button>
        </div>
      )}

      {status === "ready" && challenge && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card-african p-8 max-w-md w-full text-center z-10"
        >
          <Link to="/" className="inline-block mb-6">
            <img src={songiqLogo} alt="SongIQ — Music Trivia Game" className="h-12 mx-auto" />
          </Link>

          <Swords className="w-14 h-14 text-gold mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-1">You've been challenged!</h1>
          <p className="text-muted-foreground mb-6">{challenge.category_name}</p>

          <div className="bg-background/50 rounded-xl p-6 mb-6">
            <p className="text-muted-foreground mb-1">{challenge.creator_name} scored</p>
            <p className="text-5xl font-bold text-gold mb-2">{challenge.creator_score}</p>
            <p className="text-foreground/60">points</p>
          </div>

          <div className="flex justify-center gap-6 mb-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-primary" />
              {challenge.plan.length} songs
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" />
              {challenge.time_per_round}s per song
            </span>
          </div>

          <p className="text-foreground/80 font-semibold mb-4">
            Same songs. Same options. Can you beat it?
          </p>

          <Button
            variant="gold"
            size="lg"
            className="w-full"
            onClick={() => navigate("/solo/game", { state: { challenge } })}
          >
            <Play className="w-5 h-5 mr-2" />
            Accept Challenge
          </Button>
        </motion.div>
      )}
    </div>
  );
}
