import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RoundIndicatorProps {
  currentRound: number;
  totalRounds: number;
}

export const RoundIndicator = ({ currentRound, totalRounds }: RoundIndicatorProps) => {
  const manyRounds = totalRounds > 10;

  return (
    <>
      {/* Desktop: one dot per round, highlighted as the game progresses */}
      <div className={cn("hidden md:flex items-center flex-wrap", manyRounds ? "gap-1.5" : "gap-2")}>
        {[...Array(totalRounds)].map((_, i) => {
          const roundNum = i + 1;
          const isActive = roundNum === currentRound;
          const isCompleted = roundNum < currentRound;

          return (
            <motion.div
              key={i}
              className={cn(
                "round-dot",
                manyRounds && "w-6 h-6 text-xs",
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
      </div>

      {/* Mobile: compact current/total */}
      <div className="flex md:hidden items-center">
        <span className="round-dot active w-auto h-8 px-3">
          {Math.max(currentRound, 1)}/{totalRounds}
        </span>
      </div>
    </>
  );
};
