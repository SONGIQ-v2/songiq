import { motion } from "framer-motion";

interface TimerBarProps {
  timeLeft: number;
  maxTime: number;
}

export const TimerBar = ({ timeLeft, maxTime }: TimerBarProps) => {
  const percentage = (timeLeft / maxTime) * 100;
  const isLow = percentage < 30;

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-muted-foreground">Time remaining</span>
        <motion.span
          className={`font-bold ${isLow ? "text-red-400" : "text-primary"}`}
          animate={isLow ? { scale: [1, 1.1, 1] } : {}}
          transition={{ repeat: Infinity, duration: 0.5 }}
        >
          {Math.ceil(timeLeft / 1000)}s
        </motion.span>
      </div>
      
      <div className="progress-track">
        <motion.div
          className="progress-fill"
          initial={{ width: "100%" }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
          style={{
            background: isLow
              ? "linear-gradient(90deg, hsl(0 70% 50%), hsl(0 70% 60%))"
              : undefined,
          }}
        />
      </div>
    </div>
  );
};
