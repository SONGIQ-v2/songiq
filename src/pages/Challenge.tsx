import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Play, Swords, Clock, Hash, Crown, Copy } from "lucide-react";
import { toast } from "sonner";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import songiqLogo from "@/assets/songiq-logo.png";
import { useGameStore } from "@/lib/gameStore";
import {
  fetchChallenge,
  fetchChallengeAttempts,
  getSavedUsername,
  saveUsername,
  challengeUrl,
  type Challenge,
  type ChallengeAttempt,
} from "@/lib/challenges";

interface BoardEntry {
  name: string;
  score: number;
  isCreator: boolean;
  isMe: boolean;
}

function Leaderboard({ entries }: { entries: BoardEntry[] }) {
  return (
    <div className="bg-background/50 rounded-xl p-4 mb-6 text-left">
      <p className="text-muted-foreground mb-3 text-center text-sm">Leaderboard — first attempt counts</p>
      <div className="space-y-2">
        {entries.slice(0, 8).map((e, i) => (
          <div
            key={`${e.name}-${i}`}
            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
              e.isMe ? "bg-primary/15 border border-primary/40" : "bg-card/50"
            }`}
          >
            <span className="flex items-center gap-2 font-semibold text-foreground">
              <span className="text-muted-foreground w-6">#{i + 1}</span>
              {e.name}
              {e.isCreator && <Crown className="w-4 h-4 text-gold" />}
              {e.isMe && <span className="text-xs text-primary">(you)</span>}
            </span>
            <span className="font-bold text-gold">{e.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChallengePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { initializeAuth, playerId, setPlayer } = useGameStore();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [attempts, setAttempts] = useState<ChallengeAttempt[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");
  const [name, setName] = useState("");

  useEffect(() => {
    (async () => {
      await initializeAuth();
      const c = code ? await fetchChallenge(code) : null;
      if (!c) {
        setStatus("not_found");
        return;
      }
      setChallenge(c);
      setAttempts(await fetchChallengeAttempts(c.code));
      setName(getSavedUsername());
      setStatus("ready");
    })();
  }, [code, initializeAuth]);

  const myAttempt = attempts.find((a) => a.player_id === playerId);
  const isCreator = !!challenge?.creator_id && challenge.creator_id === playerId;

  const board: BoardEntry[] = challenge
    ? [
        { name: challenge.creator_name, score: challenge.creator_score, isCreator: true, isMe: false },
        ...attempts.map((a) => ({
          name: a.player_name,
          score: a.score,
          isCreator: false,
          isMe: a.player_id === playerId,
        })),
      ].sort((a, b) => b.score - a.score)
    : [];

  const handleAccept = () => {
    if (!challenge) return;
    const trimmed = name.trim() || "A music fan";
    saveUsername(trimmed);
    setPlayer(trimmed, 1);
    navigate("/solo/game", { state: { challenge } });
  };

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
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {isCreator
              ? "Your challenge"
              : myAttempt
              ? "You played this challenge"
              : "You've been challenged!"}
          </h1>
          <p className="text-muted-foreground mb-6">{challenge.category_name}</p>

          {!myAttempt && !isCreator && (
            <div className="bg-background/50 rounded-xl p-6 mb-6">
              <p className="text-muted-foreground mb-1">{challenge.creator_name} scored</p>
              <p className="text-5xl font-bold text-gold mb-2">{challenge.creator_score}</p>
              <p className="text-foreground/60">points</p>
            </div>
          )}

          {board.length > 1 || myAttempt || isCreator ? <Leaderboard entries={board} /> : null}

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

          {isCreator ? (
            <>
              <p className="text-foreground/80 font-semibold mb-4">
                This is your challenge — share the link and watch the leaderboard fill up.
              </p>
              <Button
                variant="gold"
                size="lg"
                className="w-full"
                onClick={async () => {
                  await navigator.clipboard.writeText(challengeUrl(challenge.code));
                  toast.success("Challenge link copied!");
                }}
              >
                <Copy className="w-5 h-5 mr-2" />
                Copy Challenge Link
              </Button>
            </>
          ) : myAttempt ? (
            <>
              <p className="text-foreground/80 font-semibold mb-4">
                First attempt counts — your {myAttempt.score} points are locked in.
              </p>
              <Button variant="gold" size="lg" className="w-full" onClick={() => navigate("/")}>
                Play more on SongIQ
              </Button>
            </>
          ) : (
            <>
              <p className="text-foreground/80 font-semibold mb-4">
                Same songs. Same options. One attempt — make it count.
              </p>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your nickname"
                aria-label="Your nickname"
                maxLength={20}
                className="text-center text-lg mb-4"
                onKeyDown={(e) => e.key === "Enter" && name.trim() && handleAccept()}
              />
              <Button
                variant="gold"
                size="lg"
                className="w-full"
                onClick={handleAccept}
                disabled={!name.trim()}
              >
                <Play className="w-5 h-5 mr-2" />
                Accept Challenge
              </Button>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
