import { Shield, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type StreakSaveEvent = "save_used" | "repair_restored";

/**
 * Centered, must-be-dismissed-by-the-player confirmation for the two "your
 * streak almost died and didn't" moments -- a toast is easy to miss, and
 * these are exactly the moments worth making sure the player actually sees
 * (both to reassure them nothing broke, and to reinforce that the mechanic
 * that just saved them is worth caring about).
 */
export function StreakSaveModal({
  event,
  streak,
  onClose,
}: {
  event: StreakSaveEvent | null;
  streak: number;
  onClose: () => void;
}) {
  const isRestored = event === "repair_restored";

  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader className="items-center">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-2">
            {isRestored ? (
              <PartyPopper className="w-8 h-8 text-primary" />
            ) : (
              <Shield className="w-8 h-8 text-primary" />
            )}
          </div>
          <DialogTitle className="text-xl">
            {isRestored ? "Streak restored!" : "Streak Save used"}
          </DialogTitle>
          <DialogDescription className="text-base pt-1">
            {isRestored
              ? `Your friends came through — your ${streak}-day streak is safe.`
              : `You missed a day, but a Streak Save quietly covered it — your ${streak}-day streak is protected.`}
          </DialogDescription>
        </DialogHeader>
        <Button variant="gold" onClick={onClose} className="w-full mt-2">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}
