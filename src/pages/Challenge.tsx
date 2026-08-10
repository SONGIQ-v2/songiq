import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Music2, Play, Swords, Clock, Hash, Crown, Copy } from "lucide-react";
import { toast } from "sonner";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import songiqLogo from "@/assets/songiq-logo.png";
import { useGameStore } from "@/lib/gameStore";
import { trackEvent } from "@/lib/analytics";
import {
  fetchChallenge,
  fetchChallengeAttempts,
  fetchMyChallengeAttempt,
  getKnownPlayerName,
  saveUsername,
  challengeUrl,
  type Challenge,
  type ChallengeAttempt,
} from "@/lib/challenges";

interface BoardEntry {
  name: string;
  playerId?: string | null;
  score: number;
  isCreator: boolean;
  isMe: boolean;
}

function Leaderboard({ entries }: { entries: BoardEntry[] }) {
  return (
    <div className="bg-background/50 rounded-xl p-4 mb-6 text-left">
      <p className="text-muted-foreground mb-3 text-center text-sm">
        Leaderboard — First Attempt Counts
      </p>
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {entries.map((e, i) => (
          <div
            key={`${e.name}-${i}`}
            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
              e.isMe ? "bg-primary/15 border border-primary/40" : "bg-card/50"
            }`}
          >
            <span className="flex items-center gap-2 font-semibold text-foreground min-w-0">
              <span className="text-muted-foreground w-6">#{i + 1}</span>
              <PlayerAvatar variant="icon-only" size="xs" name={e.name} avatarIndex={1} playerId={e.playerId ?? undefined} />
              <span className="truncate">{e.name}</span>
              {e.isCreator && <Crown className="w-4 h-4 text-gold shrink-0" />}
              {e.isMe && <span className="text-xs text-primary shrink-0">(you)</span>}
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
  const [myAttempt, setMyAttempt] = useState<ChallengeAttempt | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");
  const [name, setName] = useState("");

  useEffect(() => {
    (async () => {
      const pid = await initializeAuth();
      const c = code ? await fetchChallenge(code) : null;
      if (!c) {
        setStatus("not_found");
        return;
      }
      setChallenge(c);
      const [board, mine] = await Promise.all([
        fetchChallengeAttempts(c.code),
        // Direct lookup — never infer played-state from the truncated board
        pid ? fetchMyChallengeAttempt(c.code, pid) : Promise.resolve(null),
      ]);
      setAttempts(board);
      setMyAttempt(mine);
      setName(getKnownPlayerName());
      setStatus("ready");
    })();
  }, [code, initializeAuth]);
  const isCreator = !!challenge?.creator_id && challenge.creator_id === playerId;
  // Skip asking for a nickname when one is already known (profile, Google
  // sign-in, or the multiplayer cookie) -- computed fresh each render, not
  // from `name` state, so there's no flash of the input before it fills in.
  const hasKnownName = Boolean(getKnownPlayerName());

  const board: BoardEntry[] = challenge
    ? [
        {
          name: challenge.creator_name,
          playerId: challenge.creator_id,
          score: challenge.creator_score,
          isCreator: true,
          isMe: false,
        },
        ...attempts.map((a) => ({
          name: a.player_name,
          playerId: a.player_id,
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
    trackEvent("challenge_accept", {
      challenge_code: challenge.code,
      creator_score: challenge.creator_score,
    });
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
        <div className="z-10 max-w-md w-full flex flex-col items-center">
          <Link to="/" className="mb-6">
            <img src={songiqLogo} alt="SongIQ — Music Trivia Game" className="h-12" />
          </Link>

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="raised-panel p-8 w-full text-center"
          >
            <Badge className="uppercase tracking-wide mb-4">
              <Swords className="w-3 h-3 mr-1" />
              Challenge
            </Badge>

            <h1 className="text-2xl font-bold text-foreground mb-1">
              {isCreator
                ? "Your challenge"
                : myAttempt
                ? "You played this challenge"
                : "You've been challenged!"}
            </h1>
            <p className="text-muted-foreground mb-6">{challenge.category_name}</p>

            {!myAttempt && !isCreator && (
              <div className="bg-background/50 rounded-xl px-0 sm:px-4 py-4 mb-6 flex items-center justify-between text-left gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar
                    variant="icon-only"
                    size="md"
                    className="w-10 h-10 sm:w-14 sm:h-14"
                    name={challenge.creator_name}
                    avatarIndex={1}
                    playerId={challenge.creator_id ?? undefined}
                  />
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-sm truncate">{challenge.creator_name} scored</p>
                    <p className="text-3xl font-bold text-gold leading-none">
                      {challenge.creator_score} <span className="text-sm font-normal text-foreground/60">pts</span>
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground space-y-1 shrink-0">
                  <p className="flex items-center justify-end gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-primary" />
                    {challenge.plan.length} songs
                  </p>
                  <p className="flex items-center justify-end gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    {challenge.time_per_round}s per song
                  </p>
                </div>
              </div>
            )}

            {board.length > 1 || myAttempt || isCreator ? <Leaderboard entries={board} /> : null}

            {(isCreator || !!myAttempt) && (
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
            )}

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
              {!hasKnownName && (
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your nickname"
                  aria-label="Your nickname"
                  maxLength={20}
                  className="text-center text-lg mb-4"
                  onKeyDown={(e) => e.key === "Enter" && name.trim() && handleAccept()}
                />
              )}
              <Button
                variant="gold"
                size="lg"
                className="w-full"
                onClick={handleAccept}
                disabled={!name.trim()}
              >
                <Play className="w-5 h-5 mr-2" />
                Accept Challenge →
              </Button>
            </>
          )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
