import { Flame, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Pure presentational, same pattern as SignInPointsNotification -- given a
 * streak number, render the bar. Used by NotificationBar (real fetched
 * streak) and can be reused by an admin preview card later the same way
 * SignInPointsNotification is.
 */
export function StreakAtRiskNotification({
  streak,
  onDismiss,
}: {
  streak: number;
  onDismiss?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm text-white bg-[#1A1635]">
      <Flame className="w-4 h-4 shrink-0 text-primary" />
      <span className="text-center">
        Your <span className="font-bold text-primary">{streak}-day streak</span> ends today. Play now to keep it alive.
      </span>
      <Button
        size="sm"
        className="h-7 px-3 shrink-0 bg-primary text-[#1A1635] hover:bg-primary/90"
        onClick={() => navigate("/daily")}
      >
        Play Daily
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
