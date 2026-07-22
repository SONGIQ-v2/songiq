// Shared motion language for the homepage's tactile/gamified redesign —
// keeps button.tsx, GameModeCard.tsx, and Index.tsx springing in sync.

export const BUTTON_SPRING = { type: "spring", stiffness: 400, damping: 17, mass: 0.9 } as const;
export const CARD_SPRING = { type: "spring", stiffness: 340, damping: 20 } as const; // ≈ GSAP back.out(1.4)

export const staggerContainer = (staggerChildren = 0.08, delayChildren = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren, delayChildren } },
});

export const popIn = {
  hidden: { opacity: 0, y: 24, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: CARD_SPRING },
};

export const pillPopIn = {
  hidden: { opacity: 0, scale: 0.85 },
  show: { opacity: 1, scale: 1, transition: CARD_SPRING },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

/** Swaps the whole motion set for a still, opacity-only version under prefers-reduced-motion. */
export function getMotionVariants(reduced: boolean) {
  if (!reduced) {
    return { container: staggerContainer, pop: popIn, pill: pillPopIn, fade: fadeUp };
  }
  const still = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.15 } } };
  return {
    container: () => ({ hidden: {}, show: { transition: { staggerChildren: 0 } } }),
    pop: still,
    pill: still,
    fade: still,
  };
}
