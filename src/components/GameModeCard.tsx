import { motion, type Variants } from "framer-motion";
import { Music, Users, Play } from "lucide-react";
import { BUTTON_SPRING } from "@/lib/motion";

interface GameModeCardProps {
  title: string;
  description: string;
  icon: "solo" | "multiplayer";
  onClick: () => void;
  isPrimary?: boolean;
  variants?: Variants;
}

export const GameModeCard = ({
  title,
  description,
  icon,
  onClick,
  isPrimary = false,
  variants,
}: GameModeCardProps) => {
  const Icon = icon === "solo" ? Music : Users;

  return (
    <motion.button
      onClick={onClick}
      variants={variants}
      className={`${isPrimary ? "game-card-primary" : "game-card"} w-full text-left group`}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      transition={BUTTON_SPRING}
    >
      <div className="flex flex-col items-center text-center">
        {/* Icon */}
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
          isPrimary 
            ? "bg-primary/20 text-primary" 
            : "bg-secondary text-foreground/70"
        }`}>
          <Icon className="w-8 h-8" />
        </div>

        {/* Title */}
        <h3 className="font-display text-xl md:text-2xl mb-2">
          {title}
        </h3>

        {/* Description */}
        <p className="text-muted-foreground text-sm">{description}</p>

        {/* Play indicator on hover — reacts to hovering the whole card (the
            `group` is the outer button), not just this row */}
        <div className="mt-4 flex items-center gap-2 text-primary opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
          <Play className="w-4 h-4 fill-current" />
          <span className="text-sm font-medium">Play</span>
        </div>
      </div>
    </motion.button>
  );
};
