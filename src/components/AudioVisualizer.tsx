import { motion } from "framer-motion";

interface AudioVisualizerProps {
  isPlaying: boolean;
}

export const AudioVisualizer = ({ isPlaying }: AudioVisualizerProps) => {
  return (
    <div className="flex items-end justify-center gap-1 h-12">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="audio-bar"
          animate={
            isPlaying
              ? {
                  scaleY: [0.5, 1, 0.5],
                }
              : { scaleY: 0.3 }
          }
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};
