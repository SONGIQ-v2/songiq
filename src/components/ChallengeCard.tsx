import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Hash, Clock, Trophy, Users } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import type { PublicChallengeSummary } from "@/lib/challenges";

interface ChallengeCardProps {
  challenge: PublicChallengeSummary;
  verified: boolean;
  /** challenge.creator_id === the viewer's own playerId */
  isOwn: boolean;
  /** Set if the viewer already has an attempt on this code */
  myScore?: number;
  /** Lets a parent stagger this card into its own entrance animation
   *  (e.g. Index.tsx's container()/pop convention) -- optional since
   *  BrowseChallenges.tsx doesn't stagger its own grid. */
  variants?: Variants;
}

export function ChallengeCard({ challenge, verified, isOwn, myScore, variants }: ChallengeCardProps) {
  const {
    code,
    creator_id,
    creator_name,
    category_name,
    time_per_round,
    song_count,
    attempt_count,
    top_name,
    top_score,
    created_at,
  } = challenge;

  const leaderIsCreator = top_name === creator_name;

  return (
    <Link to={`/c/${code}`} className="block">
      <motion.div
        variants={variants}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="rounded-xl border-2 border-border/50 hover:border-primary/50 bg-card/50 transition-colors p-4 h-full"
      >
        <div className="flex items-center justify-between gap-x-2 gap-y-1 flex-wrap mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <PlayerAvatar variant="icon-only" size="xs" name={creator_name} avatarIndex={1} playerId={creator_id ?? undefined} />
            {isOwn ? (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5">
                Your challenge
              </span>
            ) : (
              <>
                <span className="text-xs text-muted-foreground truncate">
                  Created by <span className="font-semibold text-foreground">{creator_name}</span>
                </span>
                {verified && <VerifiedBadge />}
              </>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(created_at), { addSuffix: true })}
          </span>
        </div>

        <h3 className="font-bold text-foreground mb-1 truncate">{category_name}</h3>
        <p className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Hash className="w-3.5 h-3.5 text-primary" />
            {song_count} songs
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-primary" />
            {time_per_round}s per song
          </span>
          {myScore != null && (
            <span className="text-primary font-semibold">You scored {myScore}</span>
          )}
        </p>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/40">
          <p className="flex items-center gap-1.5 text-sm">
            <Trophy className="w-4 h-4 text-gold shrink-0" />
            <span>
              <span className="font-bold text-gold">{top_score}</span>{" "}
              <span className="text-muted-foreground">
                {leaderIsCreator ? "set by the creator" : `— ${top_name} is leading`}
              </span>
            </span>
          </p>
          <span className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            {attempt_count}
          </span>
        </div>
      </motion.div>
    </Link>
  );
}
