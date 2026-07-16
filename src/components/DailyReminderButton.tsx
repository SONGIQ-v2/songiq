import { useState, useEffect } from "react";
import { Bell, BellRing, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/lib/gameStore";
import { getPushSupport, isSubscribed, subscribeToDailyReminders } from "@/lib/push";

/**
 * "Remind me tomorrow" — subscribes the browser to daily challenge push
 * reminders. Hides itself when unsupported; on iOS Safari (browser tab)
 * explains the add-to-home-screen requirement instead.
 */
export function DailyReminderButton({ className = "" }: { className?: string }) {
  const { playerId, initializeAuth } = useGameStore();
  const [state, setState] = useState<"hidden" | "idle" | "ios" | "busy" | "done">("hidden");

  useEffect(() => {
    (async () => {
      const support = getPushSupport();
      if (support === "unsupported") return;
      if (support === "ios_needs_install") {
        setState("ios");
        return;
      }
      setState((await isSubscribed()) ? "done" : "idle");
    })();
  }, []);

  if (state === "hidden") return null;

  if (state === "done") {
    return (
      <p className={`text-sm text-muted-foreground flex items-center justify-center gap-1.5 ${className}`}>
        <BellRing className="w-4 h-4 text-gold" /> Daily reminder is on
      </p>
    );
  }

  if (state === "ios") {
    return (
      <p className={`text-xs text-muted-foreground flex items-center justify-center gap-1.5 ${className}`}>
        <Share className="w-3.5 h-3.5" />
        For daily reminders: Share → Add to Home Screen, then enable them here
      </p>
    );
  }

  const handleClick = async () => {
    setState("busy");
    const pid = playerId ?? (await initializeAuth());
    if (!pid) {
      setState("idle");
      toast.error("Couldn't set the reminder — try again");
      return;
    }
    const result = await subscribeToDailyReminders(pid);
    if (result === "subscribed") {
      setState("done");
      toast.success("Reminder set — see you tomorrow!");
    } else {
      setState("idle");
      toast.error(
        result === "denied"
          ? "Notifications were blocked — enable them in your browser settings"
          : "Couldn't set the reminder — try again later"
      );
    }
  };

  return (
    <Button
      variant="outline"
      className={`w-full ${className}`}
      onClick={handleClick}
      disabled={state === "busy"}
    >
      <Bell className="w-4 h-4 mr-2" />
      {state === "busy" ? "Setting reminder..." : "Remind me tomorrow"}
    </Button>
  );
}
