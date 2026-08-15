import { motion } from "framer-motion";
import { CloudUpload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/lib/gameStore";
import { useSignInHint } from "@/hooks/useSignInHint";

/**
 * Shown on a results screen (solo, challenge, daily, multiplayer) right
 * before Share Result -- the moment a guest is most likely to care that
 * this run only exists on this device. Anonymous-only and dismissible via
 * useSignInHint's shared key, same as the other sign-in hint surfaces
 * (Leaderboard, Daily) -- saying "not now" once shouldn't mean getting
 * asked again on every single results screen.
 */
export function SaveProgressPrompt() {
  const { openSignInModal } = useGameStore();
  const signInHint = useSignInHint();

  if (!signInHint.show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 sm:gap-2.5 mb-4 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl bg-gold/10 border border-gold/30"
    >
      <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center">
        <CloudUpload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[11px] sm:text-sm font-bold text-foreground leading-tight">
          Sign In to Save Your Progress
        </p>
        <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
          Don't lose your points, streaks &amp; rank
        </p>
      </div>
      <Button
        variant="gold"
        size="sm"
        onClick={openSignInModal}
        className="shrink-0 h-7 sm:h-9 px-2 sm:px-3 text-[10px] sm:text-xs"
      >
        Sign In
      </Button>
      <button
        onClick={signInHint.dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}
