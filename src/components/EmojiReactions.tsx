import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactionEvent } from "@/hooks/useMultiplayerGame";

const QUICK_REACTIONS = ["🔥", "😂", "👏", "😮", "❤️", "🎉"];

/**
 * Small stack of tappable emoji buttons. A brief per-button cooldown just
 * guards against accidental double-taps flooding the room channel -- there's
 * no server-side rate limit since reactions are purely cosmetic/ephemeral.
 */
export function ReactionBar({
  onSend,
  orientation = "horizontal",
}: {
  onSend: (emoji: string) => void;
  orientation?: "horizontal" | "vertical";
}) {
  const [cooldown, setCooldown] = useState<string | null>(null);

  const handleClick = (emoji: string) => {
    if (cooldown) return;
    onSend(emoji);
    setCooldown(emoji);
    setTimeout(() => setCooldown(null), 350);
  };

  return (
    <div
      className={
        orientation === "vertical"
          ? "flex flex-col items-center gap-1 px-1.5 py-2 rounded-full bg-card/80 backdrop-blur-md border border-border/60 shadow-lg"
          : "flex items-center gap-1 px-2 py-1.5 rounded-full bg-card/80 backdrop-blur-md border border-border/60 shadow-lg"
      }
    >
      {QUICK_REACTIONS.map((emoji) => (
        <motion.button
          key={emoji}
          type="button"
          aria-label={`React with ${emoji}`}
          onClick={() => handleClick(emoji)}
          whileTap={{ scale: 1.4 }}
          disabled={cooldown === emoji}
          className="w-8 h-8 flex items-center justify-center text-lg rounded-full hover:bg-primary/15 transition-colors disabled:opacity-50"
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );
}

/**
 * Full-area overlay that renders active reactions floating from near the
 * bottom all the way past the top of the viewport, then fading -- a full
 * traverse (Google Meet-style), not a short drift. Mount once per screen
 * (Room Lobby, live game) with pointer-events disabled so it never blocks
 * taps underneath.
 */
export function FloatingReactions({ reactions }: { reactions: ReactionEvent[] }) {
  // Randomized once per reaction id (not on every re-render) so a
  // reaction's horizontal position/drift stays stable for its lifetime.
  const layout = useMemo(() => new Map<string, { left: number; drift: number; delay: number }>(), []);

  // Drop entries for reactions that have already been removed from state
  // (their animation finished) so this map doesn't grow for the whole game.
  useEffect(() => {
    const liveIds = new Set(reactions.map((r) => r.id));
    for (const id of layout.keys()) {
      if (!liveIds.has(id)) layout.delete(id);
    }
  }, [reactions, layout]);

  const getLayout = (id: string) => {
    if (!layout.has(id)) {
      layout.set(id, {
        left: 10 + Math.random() * 70,
        drift: (Math.random() - 0.5) * 80,
        delay: Math.random() * 0.15,
      });
    }
    return layout.get(id)!;
  };

  // A plain pixel number (not a "vh" string) -- Framer Motion tweens a
  // motion value numerically, and can't cleanly interpolate between a
  // unitless 0 and a differently-unit string target, which was silently
  // truncating the rise. window.innerHeight also matches the real device
  // viewport, including on mobile where "100vh" is unreliable.
  // Starts near the bottom (bottom-10 = 40px) and stops 300px short of the
  // top, where the opacity keyframes below finish fading it out -- not a
  // full top-to-bottom traverse.
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const travelDistance = Math.max(300, viewportHeight - 340);
  const RISE_DURATION = 5.2;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      <AnimatePresence>
        {reactions.map((r) => {
          const { left, drift, delay } = getLayout(r.id);
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 0, x: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -travelDistance, x: drift, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: RISE_DURATION,
                delay,
                ease: "easeOut",
                opacity: { duration: RISE_DURATION, delay, times: [0, 0.08, 0.75, 1] },
              }}
              className="absolute bottom-10 flex flex-col items-center gap-1.5"
              style={{ left: `${left}%` }}
            >
              <span className="text-7xl leading-none drop-shadow-lg">{r.emoji}</span>
              <span className="text-xs font-bold text-[#0B2545] bg-[#AECBFA] px-2.5 py-1 rounded-full whitespace-nowrap shadow">
                {r.isSelf ? "You" : r.playerName}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
