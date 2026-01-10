import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RoundIndicatorProps {
  currentRound: number;
  totalRounds: number;
}

export const RoundIndicator = ({ currentRound, totalRounds }: RoundIndicatorProps) => {
  return (
    <div className="flex items-center gap-2">
      {[...Array(Math.min(totalRounds, 5))].map((_, i) => {
        const roundNum = i + 1;
        const isActive = roundNum === currentRound;
        const isCompleted = roundNum < currentRound;

        return (
          <motion.div
            key={i}
            className={cn(
              "round-dot",
              isActive && "active",
              isCompleted && "completed"
            )}
            initial={{ scale: 0.8, opacity: 0.5 }}
            animate={{
              scale: isActive ? 1.1 : 1,
              opacity: 1,
            }}
            transition={{ duration: 0.3 }}
          >
            {roundNum}
          </motion.div>
        );
      })}
      {totalRounds > 5 && (
        <span className="text-muted-foreground text-sm ml-1">
          /{totalRounds}
        </span>
      )}
    </div>
  );
};
