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

export const AnswerOption = ({
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
        "answer-option",
        isRevealed && isSelected && isCorrect && "correct",
        isRevealed && isSelected && !isCorrect && "incorrect",
        isRevealed && !isSelected && isCorrect && "correct opacity-70"
      )}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={!disabled ? { scale: 1.01 } : {}}
      whileTap={!disabled ? { scale: 0.99 } : {}}
    >
      <div className="flex items-center gap-4">
        {/* Letter badge */}
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm",
          isSelected 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted text-muted-foreground"
        )}>
          {letters[index]}
        </div>
        
        {/* Option text */}
        <span className="text-left flex-1 line-clamp-2">{option}</span>

        {/* Result indicator */}
        {isRevealed && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
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
