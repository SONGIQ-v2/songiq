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
export function DailyReminderButton({
  className = "",
  variant = "inline",
}: {
  className?: string;
  /** "card" is a standalone banner (bell badge + copy + outline button) that
   *  hides itself once reminders are already on, instead of the inline
   *  gradient button + "Daily reminder is on" text swap. */
  variant?: "inline" | "card";
}) {
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
    if (variant === "card") return null; // already on -- nothing to prompt
    return (
      <p className={`text-sm text-muted-foreground flex items-center justify-center gap-1.5 ${className}`}>
        <BellRing className="w-4 h-4 text-gold" /> Daily reminder is on
      </p>
    );
  }

  if (state === "ios") {
    return (
      <div className={`bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 text-left ${className}`}>
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <Share className="w-4 h-4 text-primary" />
          Get daily reminders on iPhone
        </p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Tap the Share icon in Safari's toolbar</li>
          <li>Scroll down and tap "Add to Home Screen"</li>
          <li>Open SongIQ from your home screen, then tap the button here again</li>
        </ol>
      </div>
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
          : result === "not_ready"
          ? "Reminders are warming up — try again in a few minutes"
          : "Couldn't set the reminder — try again later"
      );
    }
  };

  if (variant === "card") {
    return (
      <div className={`raised-panel flex items-center justify-between gap-4 flex-wrap p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-card/60 border border-border flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground">Daily Reminder</p>
            <p className="text-sm text-muted-foreground">Get notified daily when a new challenge drops</p>
          </div>
        </div>
        <Button
          onClick={handleClick}
          disabled={state === "busy"}
          className="border-0 font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-lg shadow-red-500/30 shrink-0"
        >
          <Bell className="w-4 h-4 mr-2" />
          {state === "busy" ? "Setting reminder..." : "Remind me tomorrow"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="lg"
      className={`w-full border-0 font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-lg shadow-red-500/30 ${className}`}
      onClick={handleClick}
      disabled={state === "busy"}
    >
      <Bell className="w-5 h-5 mr-2" />
      {state === "busy" ? "Setting reminder..." : "Remind me tomorrow"}
    </Button>
  );
}
