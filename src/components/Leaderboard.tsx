import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, TrendingUp, TrendingDown, Minus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";

interface LeaderboardPlayer {
  id: string;
  player_id: string;
  player_name: string;
  avatar_index: number;
  score: number;
  is_host: boolean;
  previousRank?: number;
  currentRank?: number;
  roundScore?: number;
  hasAnswered?: boolean;
}

interface LeaderboardProps {
  players: LeaderboardPlayer[];
  currentPlayerId: string | null;
  showRoundScore?: boolean;
  compact?: boolean;
  /** Number of higher ranks not present in `players` (e.g. a podium shown separately). Offsets the displayed rank numbers and medal colors. */
  rankOffset?: number;
  /** Hides the "Leaderboard" header — useful when this list is a continuation of a podium shown above it. */
  hideHeader?: boolean;
}

const RANK_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"];

export function Leaderboard({
  players,
  currentPlayerId,
  showRoundScore = false,
  compact = false,
  rankOffset = 0,
  hideHeader = false,
}: LeaderboardProps) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  const getRankChange = (player: LeaderboardPlayer) => {
    if (!player.previousRank || !player.currentRank) return "same";
    if (player.currentRank < player.previousRank) return "up";
    if (player.currentRank > player.previousRank) return "down";
    return "same";
  };

  return (
    <div className={cn("bg-card/80 backdrop-blur-sm rounded-2xl border border-border overflow-hidden", compact ? "p-3" : "p-4")}>
      {!hideHeader && (
        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-5 h-5 text-gold" />
          <h3 className="font-bold text-foreground">Leaderboard</h3>
        </div>
      )}

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {sortedPlayers.map((player, index) => (
            <LeaderboardRow
              key={player.player_id}
              player={player}
              index={index + rankOffset}
              isCurrentPlayer={player.player_id === currentPlayerId}
              rankChange={getRankChange(player)}
              showRoundScore={showRoundScore}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface LeaderboardRowProps {
  player: LeaderboardPlayer;
  index: number;
  isCurrentPlayer: boolean;
  rankChange: "up" | "down" | "same";
  showRoundScore: boolean;
}

const LeaderboardRow = memo(
  ({ player, index, isCurrentPlayer, rankChange, showRoundScore }: LeaderboardRowProps) => {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ type: "spring", stiffness: 500, damping: 30, layout: { duration: 0.4 } }}
        className={cn(
          "flex items-center gap-3 p-2 rounded-xl transition-colors",
          isCurrentPlayer && "bg-primary/10 border border-primary/30",
          !isCurrentPlayer && "hover:bg-muted/50"
        )}
      >
        <div className={cn("w-6 text-center font-bold", index < 3 && RANK_COLORS[index])}>
          {index + 1}
        </div>
        <div className="w-4">
          <AnimatePresence mode="wait">
            {rankChange === "up" && (
              <motion.div key="up" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} className="text-green-500">
                <TrendingUp className="w-4 h-4" />
              </motion.div>
            )}
            {rankChange === "down" && (
              <motion.div key="down" initial={{ scale: 0, rotate: 45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} className="text-red-500">
                <TrendingDown className="w-4 h-4" />
              </motion.div>
            )}
            {rankChange === "same" && (
              <motion.div key="same" className="text-muted-foreground">
                <Minus className="w-4 h-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <PlayerAvatar
          variant="icon-only"
          size="xs"
          name={player.player_name}
          avatarIndex={player.avatar_index}
          playerId={player.player_id}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={cn("font-medium truncate", isCurrentPlayer && "text-primary")}>
              {player.player_name}
            </span>
            {player.is_host && <Crown className="w-3 h-3 text-gold" />}
            {isCurrentPlayer && <span className="text-xs text-muted-foreground">(you)</span>}
          </div>
        </div>
        {showRoundScore && (
          <div className="w-6">
            {player.hasAnswered && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                <Check className="w-3 h-3 text-primary" />
              </motion.div>
            )}
          </div>
        )}
        <div className="text-right">
          <motion.div key={player.score} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="font-bold text-gold">
            {player.score}
          </motion.div>
          {showRoundScore && player.roundScore !== undefined && player.roundScore > 0 && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-green-500">
              +{player.roundScore}
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  },
  (prev, next) =>
    prev.index === next.index &&
    prev.isCurrentPlayer === next.isCurrentPlayer &&
    prev.rankChange === next.rankChange &&
    prev.showRoundScore === next.showRoundScore &&
    prev.player.player_id === next.player.player_id &&
    prev.player.score === next.player.score &&
    prev.player.is_host === next.player.is_host &&
    prev.player.player_name === next.player.player_name &&
    prev.player.avatar_index === next.player.avatar_index &&
    prev.player.hasAnswered === next.player.hasAnswered &&
    prev.player.roundScore === next.player.roundScore
);
LeaderboardRow.displayName = "LeaderboardRow";

