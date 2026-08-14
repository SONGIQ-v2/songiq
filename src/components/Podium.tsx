import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { CARD_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface PodiumPlayer {
  player_id: string;
  player_name: string;
  avatar_index: number;
  score: number;
  is_host: boolean;
}

interface PodiumProps {
  /** Top 3 players, already sorted by score descending. Fewer than 3 (e.g. a 2-player game) is fine. */
  players: PodiumPlayer[];
  currentPlayerId: string | null;
  /** player_ids that are signed in (not anonymous) -- shown with a verified badge. */
  verifiedIds?: Set<string>;
}

const RANKS = [
  {
    crownClass: "text-gold",
    crownSize: "w-8 h-8",
    avatarSize: "lg" as const,
    blockHeight: "h-28",
    blockBg: "linear-gradient(180deg, hsl(45 90% 55%), hsl(35 85% 45%))",
    borderColor: "hsl(45 95% 65% / 0.8)",
    glow: "0 4px 0 hsl(35 80% 30%), 0 0 30px hsl(45 90% 55% / 0.5), var(--shadow-inset-highlight)",
    label: "1ST",
  },
  {
    crownClass: "text-slate-300",
    crownSize: "w-6 h-6",
    avatarSize: "md" as const,
    blockHeight: "h-20",
    blockBg: "linear-gradient(180deg, hsl(215 15% 65%), hsl(215 15% 45%))",
    borderColor: "hsl(215 20% 75% / 0.7)",
    glow: "0 4px 0 hsl(215 20% 30%), var(--shadow-inset-highlight)",
    label: "2ND",
  },
  {
    crownClass: "text-amber-600",
    crownSize: "w-6 h-6",
    avatarSize: "md" as const,
    blockHeight: "h-14",
    blockBg: "linear-gradient(180deg, hsl(25 70% 50%), hsl(20 65% 35%))",
    borderColor: "hsl(25 70% 60% / 0.7)",
    glow: "0 4px 0 hsl(20 60% 25%), var(--shadow-inset-highlight)",
    label: "3RD",
  },
];

// Visual order left-to-right: 2nd, 1st, 3rd
const DISPLAY_ORDER = [1, 0, 2];

export function Podium({ players, currentPlayerId, verifiedIds }: PodiumProps) {
  return (
    <div className="flex items-end justify-center gap-3">
      {DISPLAY_ORDER.map((rankIndex) => {
        const player = players[rankIndex];
        if (!player) return null;
        const rank = RANKS[rankIndex];
        const isMe = player.player_id === currentPlayerId;

        return (
          <motion.div
            key={player.player_id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...CARD_SPRING, delay: 0.1 + rankIndex * 0.08 }}
            className="flex flex-col items-center w-24"
          >
            <Crown className={cn(rank.crownClass, rank.crownSize, "mb-1 drop-shadow-md")} fill="currentColor" />
            <PlayerAvatar
              variant="icon-only"
              size={rank.avatarSize}
              name={player.player_name}
              avatarIndex={player.avatar_index}
              playerId={player.player_id}
            />
            <div className="mt-1.5 flex items-center gap-1 max-w-full">
              <p className={cn("text-sm font-bold truncate", isMe && "text-primary")}>
                {player.player_name}
              </p>
              {verifiedIds?.has(player.player_id) && <VerifiedBadge />}
              {player.is_host && <Crown className="w-3.5 h-3.5 text-gold shrink-0" fill="currentColor" />}
            </div>
            <p className="text-xs font-bold text-gold mb-2">{player.score} pts</p>
            <div
              className={cn(
                "relative w-full rounded-t-2xl border-2 flex items-center justify-center overflow-hidden",
                rank.blockHeight
              )}
              style={{ background: rank.blockBg, borderColor: rank.borderColor, boxShadow: rank.glow }}
            >
              <span
                className="font-display text-2xl font-bold text-white"
                style={{ textShadow: "0 2px 3px hsl(0 0% 0% / 0.35)" }}
              >
                {rank.label}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
