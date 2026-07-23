import { useMemo } from "react";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  name: string;
  avatarIndex: number;
  playerId?: string;
  score?: number;
  isHost?: boolean;
  size?: "2xs" | "xs" | "sm" | "md" | "lg";
  showScore?: boolean;
  /** "card" (default) renders the full name/score/crown layout used in the lobby.
   *  "icon-only" renders just the avatar circle, for embedding in a custom row layout. */
  variant?: "card" | "icon-only";
  /** Extra classes merged onto the avatar circle — e.g. responsive size overrides. Only applies to "icon-only". */
  className?: string;
}

// Fallback color palette — used only if avatar generation fails
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

const sizeClasses = {
  "2xs": "w-5 h-5 text-[10px]",
  xs: "w-8 h-8 text-sm",
  sm: "w-10 h-10 text-sm",
  md: "w-14 h-14 text-lg",
  lg: "w-20 h-20 text-2xl",
};

function useAvatarDataUri(seed: string): string | null {
  return useMemo(() => {
    try {
      return createAvatar(avataaars, { seed }).toDataUri();
    } catch {
      return null;
    }
  }, [seed]);
}

function AvatarCircle({
  name,
  avatarIndex,
  playerId,
  size,
  className,
}: {
  name: string;
  avatarIndex: number;
  playerId?: string;
  size: "2xs" | "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const colorClass = AVATAR_COLORS[(avatarIndex - 1) % AVATAR_COLORS.length];
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  const seed = `${playerId ?? name}-${avatarIndex}`;
  const dataUri = useAvatarDataUri(seed);

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {dataUri && <AvatarImage src={dataUri} alt={name} />}
      <AvatarFallback
        className={`bg-gradient-to-br ${colorClass} font-bold text-white`}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

export const PlayerAvatar = ({
  name,
  avatarIndex,
  playerId,
  score = 0,
  isHost = false,
  size = "md",
  showScore = false,
  variant = "card",
  className,
}: PlayerAvatarProps) => {
  if (variant === "icon-only") {
    return (
      <AvatarCircle name={name} avatarIndex={avatarIndex} playerId={playerId} size={size} className={className} />
    );
  }

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
      <AvatarCircle name={name} avatarIndex={avatarIndex} playerId={playerId} size={size} />

      {/* Name */}
      <span className="text-sm font-medium truncate max-w-[80px]">{name}</span>

      {/* Score */}
      {showScore && (
        <span className="text-xs text-primary font-bold">{score} pts</span>
      )}
    </motion.div>
  );
};
