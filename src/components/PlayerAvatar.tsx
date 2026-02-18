import { motion } from "framer-motion";
import { Crown } from "lucide-react";

interface PlayerAvatarProps {
  name: string;
  avatarIndex: number;
  score?: number;
  isHost?: boolean;
  size?: "sm" | "md" | "lg";
  showScore?: boolean;
}

// Avatar color palettes
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

export const PlayerAvatar = ({
  name,
  avatarIndex,
  score = 0,
  isHost = false,
  size = "md",
  showScore = false,
}: PlayerAvatarProps) => {
  const sizeClasses = {
    sm: "w-10 h-10 text-sm",
    md: "w-14 h-14 text-lg",
    lg: "w-20 h-20 text-2xl",
  };

  const colorClass = AVATAR_COLORS[(avatarIndex - 1) % AVATAR_COLORS.length];
  const initial = name ? name.charAt(0).toUpperCase() : "?";

  return (
    <motion.div
      className="flex flex-col items-center gap-1"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
    >
      {/* Crown for host - always reserve space */}
      <div className="h-5">
        {isHost && (
          <motion.div
            initial={{ y: 5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-primary"
          >
            <Crown className="w-5 h-5 fill-current" />
          </motion.div>
        )}
      </div>

      {/* Avatar */}
      <div
        className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center font-bold shadow-lg`}
      >
        {initial}
      </div>

      {/* Name */}
      <span className="text-sm font-medium truncate max-w-[80px]">{name}</span>

      {/* Score */}
      {showScore && (
        <span className="text-xs text-primary font-bold">{score} pts</span>
      )}
    </motion.div>
  );
};
