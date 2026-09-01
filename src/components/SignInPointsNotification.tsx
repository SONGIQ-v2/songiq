import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/lib/gameStore";

/**
 * Pure presentational -- no fetching, no session logic, just "given a points
 * number, render the bar." Used two places: NotificationBar (real fetched
 * points, real anonymous session) and the admin Notifications tab's preview
 * card (a fake sample number) -- so the admin's preview is guaranteed
 * pixel-identical to what a real qualifying player sees, never a copy that
 * could visually drift from the real design over time.
 */
export function SignInPointsNotification({
  points,
  onDismiss,
}: {
  points: number;
  onDismiss?: () => void;
}) {
  const { openSignInModal } = useGameStore();

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm text-white bg-[#1A1635]">
      <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
      <span className="text-center">
        You could lose your <span className="font-bold text-primary">{points} points</span>. Sign in to save them.
      </span>
      <Button
        size="sm"
        className="h-7 px-3 shrink-0 bg-primary text-[#1A1635] hover:bg-primary/90"
        onClick={openSignInModal}
      >
        Sign In
      </Button>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-white opacity-80 hover:opacity-100"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
