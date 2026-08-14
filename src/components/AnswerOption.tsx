import { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CARD_SPRING, BUTTON_SPRING } from "@/lib/motion";

interface AnswerOptionProps {
  option: string;
  index: number;
  isSelected: boolean;
  isCorrect?: boolean;
  isRevealed: boolean;
  disabled: boolean;
  onClick: () => void;
}

export const AnswerOption = memo(({
  option,
  index,
  isSelected,
  isCorrect,
  isRevealed,
  disabled,
  onClick,
}: AnswerOptionProps) => {

  const letters = ["A", "B", "C", "D"];
  const wrongPick = isRevealed && isSelected && !isCorrect;
  const rightPick = isRevealed && !!isCorrect;

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "answer-option h-full min-h-[100px] flex-col justify-center",
        !isRevealed && isSelected && "locked",
        isRevealed && isSelected && isCorrect && "correct",
        isRevealed && isSelected && !isCorrect && "incorrect",
        isRevealed && !isSelected && isCorrect && "correct opacity-70"
      )}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={
        wrongPick
          ? { opacity: 1, scale: 1, x: [0, -6, 6, -6, 0] }
          : rightPick
          ? { opacity: 1, scale: [1, 1.05, 1] }
          : { opacity: 1, scale: 1 }
      }
      transition={
        wrongPick || rightPick
          ? { duration: 0.4 }
          : { ...CARD_SPRING, delay: index * 0.05 }
      }
      whileHover={!disabled ? { scale: 1.03, x: 3, transition: BUTTON_SPRING } : undefined}
      whileTap={!disabled ? { scale: 0.95, transition: BUTTON_SPRING } : undefined}
    >
      <div className="flex flex-col items-center gap-2 text-center p-2">
        {/* Letter badge */}
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
          isSelected 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted text-muted-foreground"
        )}>
          {letters[index]}
        </div>
        
        {/* Option text */}
        <span className="text-sm font-medium line-clamp-2">{option}</span>

        {/* Result indicator */}
        {isRevealed && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={CARD_SPRING}
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs",
              isCorrect ? "bg-kente-green/20 text-kente-green" : "bg-kente-red/20 text-kente-red"
            )}
          >
            {isCorrect ? "✓" : "✗"}
          </motion.div>
        )}
      </div>
    </motion.button>
  );
});
AnswerOption.displayName = "AnswerOption";

