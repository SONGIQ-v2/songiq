import { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";


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

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "answer-option h-full min-h-[100px] flex-col justify-center",
        isRevealed && isSelected && isCorrect && "correct",
        isRevealed && isSelected && !isCorrect && "incorrect",
        isRevealed && !isSelected && isCorrect && "correct opacity-70"
      )}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
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
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs",
              isCorrect ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
            )}
          >
            {isCorrect ? "✓" : "✗"}
          </motion.div>
        )}
      </div>
    </motion.button>
  );
};
