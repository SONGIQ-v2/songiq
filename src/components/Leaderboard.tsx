import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, TrendingUp, TrendingDown, Minus, Check } from "lucide-react";
import { cn } from "@/lib/utils";



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
}

const AVATAR_COLORS = [
  "from-orange-500 to-yellow-500",
  "from-pink-500 to-purple-500",
  "from-green-500 to-teal-500",
  "from-blue-500 to-cyan-500",
  "from-red-500 to-orange-500",
  "from-purple-500 to-indigo-500",
  "from-yellow-500 to-lime-500",
  "from-cyan-500 to-blue-500",
];

const RANK_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"];

export function Leaderboard({
  players,
  currentPlayerId,
  showRoundScore = false,
  compact = false,
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
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-gold" />
        <h3 className="font-bold text-foreground">Leaderboard</h3>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {sortedPlayers.map((player, index) => (
            <LeaderboardRow
              key={player.player_id}
              player={player}
              index={index}
              isCurrentPlayer={player.player_id === currentPlayerId}
              rankChange={getRankChange(player)}
              showRoundScore={showRoundScore}
            />
          ))}
        </AnimatePresence>
      </div>

      </div>
    </div>
  );
}
