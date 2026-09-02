import { useState, useEffect } from "react";
import { Shield, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { StreakProtectionStatus } from "@/lib/daily";

function formatCountdown(deadline: string): string {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "less than a minute";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * The highest-priority personalized notification-bar state -- the player's
 * streak already broke and they're inside the escalating referral repair
 * window (see get_streak_protection_status()). Shows live progress toward
 * today's bar and a countdown to the moment it closes for good.
 */
export function StreakRepairNotification({
  status,
  onDismiss,
}: {
  status: StreakProtectionStatus;
  onDismiss?: () => void;
}) {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(() =>
    status.repair_deadline ? formatCountdown(status.repair_deadline) : ""
  );

  useEffect(() => {
    if (!status.repair_deadline) return;
    const id = setInterval(() => setCountdown(formatCountdown(status.repair_deadline!)), 60 * 1000);
    return () => clearInterval(id);
  }, [status.repair_deadline]);

  const isChallengeTier = status.repair_day_number != null && status.repair_day_number >= 4;
  const progressText = isChallengeTier
    ? `${status.repair_progress_challenges ?? 0} of ${status.repair_target_challenges} challenges filled`
    : `${status.repair_progress_friends ?? 0} of ${status.repair_target_friends} friends played`;

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm text-white bg-[#1A1635]">
      <Shield className="w-4 h-4 shrink-0 text-primary" />
      <span className="text-center">
        Restore your <span className="font-bold text-primary">{status.current_streak}-day streak</span>:{" "}
        {progressText} · {countdown} left
      </span>
      <Button
        size="sm"
        className="h-7 px-3 shrink-0 bg-primary text-[#1A1635] hover:bg-primary/90"
        onClick={() => navigate("/solo")}
      >
        Create Challenge
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
