import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ListMusic, Music2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMotionVariants, staggerContainer } from "@/lib/motion";

export interface SongRecapItem {
  title: string;
  artist: string;
  artworkUrl?: string;
  /** true = got it, false = missed, null = never answered (counts as missed) */
  correct: boolean | null;
}

/**
 * "See song breakdown" button for the end-of-game results screen. Opens a
 * modal listing every song played, in order: cover, title, artist and
 * whether this player got it -- kept out of the results page itself so it
 * stays uncluttered. Shared by the solo engine (Solo, Daily, challenges,
 * events) and multiplayer.
 */
export function SongRecap({ items, className }: { items: SongRecapItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const item = getMotionVariants(!!reduced).fade;
  if (items.length === 0) return null;
  const gotIt = items.filter((i) => i.correct).length;

  return (
    <>
      <Button variant="outline" className={className ?? "w-full mb-6"} onClick={() => setOpen(true)}>
        <ListMusic className="w-4 h-4 mr-2" />
        See song breakdown
        <span className="ml-1.5 text-foreground/60 font-normal tabular-nums">
          · {gotIt}/{items.length}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-5 pb-3 text-left">
            <DialogTitle>Song breakdown</DialogTitle>
            <DialogDescription className="tabular-nums">
              You got {gotIt} of {items.length} right
            </DialogDescription>
          </DialogHeader>
          <motion.ol
            variants={staggerContainer(0.04, 0.05)}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-2 overflow-y-auto px-5 pb-5"
          >
            {items.map((s, i) => (
              <motion.li key={`${i}-${s.title}`} variants={item} className="flex items-center gap-3 min-w-0">
                <span className="w-5 text-xs text-foreground/40 tabular-nums text-right shrink-0">{i + 1}</span>
                {s.artworkUrl ? (
                  <img
                    src={s.artworkUrl}
                    alt=""
                    loading="lazy"
                    className="w-12 h-12 rounded-lg object-cover shrink-0 bg-card"
                  />
                ) : (
                  <span className="w-12 h-12 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                    <Music2 className="w-5 h-5 text-foreground/40" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-foreground truncate">{s.title}</span>
                  <span className="block text-sm text-foreground/60 truncate">{s.artist}</span>
                </span>
                {s.correct ? (
                  <span className="w-8 h-8 rounded-full bg-kente-green/20 text-kente-green flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" />
                    <span className="sr-only">Correct</span>
                  </span>
                ) : (
                  <span className="w-8 h-8 rounded-full bg-kente-red/20 text-kente-red flex items-center justify-center shrink-0">
                    <X className="w-4 h-4" />
                    <span className="sr-only">Missed</span>
                  </span>
                )}
              </motion.li>
            ))}
          </motion.ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
