import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { toast } from "@/hooks/use-toast";
import { SignInPointsNotification } from "@/components/SignInPointsNotification";
import { StreakAtRiskNotification } from "@/components/StreakAtRiskNotification";
import { StreakRepairNotification } from "@/components/StreakRepairNotification";
import { fetchStreakProtectionStatus, type StreakProtectionStatus } from "@/lib/daily";

const SIGNIN_DISMISS_KEY = "songiq_notif_signin_dismissed";
const STREAK_DISMISS_KEY = "songiq_notif_streak_dismissed";
const LAST_STATUS_KEY = "songiq_streak_last_status";

function lagosToday(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Rendered by Header.tsx, above the nav row. isAnonymous comes from Header
 * (which already tracks it) rather than re-checking the session here too --
 * Header, useSignInHint, and gameStore's auth listener each already do their
 * own copy of this same check; this avoids a 4th.
 *
 * Precedence (highest wins):
 * 1. An active admin-authored notification (site_notifications) -- an
 *    admin's explicit broadcast can always take over the bar.
 * 2. Streak repair in progress -- the player's streak already broke and
 *    they're inside the referral repair window. Outranks the plain at-risk
 *    warning below since there's an active deadline.
 * 3. Streak-at-risk / a Save would cover today -- the current player
 *    (anonymous or signed in) has an active streak that hasn't been
 *    extended today. More timely and personalized than the sign-in nudge.
 * 4. The built-in sign-in-points fallback, for anonymous players over the
 *    admin-configurable points threshold (site_settings.signin_points_threshold,
 *    Notifications tab) -- a hard floor the admin can't turn off entirely,
 *    since it isn't stored as a togglable row -- only its threshold is
 *    configurable.
 */
export function NotificationBar({ isAnonymous }: { isAnonymous: boolean }) {
  const { playerId } = useGameStore();
  const [customHtml, setCustomHtml] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(200);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SIGNIN_DISMISS_KEY) === "1"
  );
  const [streakStatus, setStreakStatus] = useState<StreakProtectionStatus | null>(null);
  const [streakDismissed, setStreakDismissed] = useState(
    () => sessionStorage.getItem(STREAK_DISMISS_KEY) === lagosToday()
  );

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("site_notifications")
        .select("html")
        .eq("is_active", true)
        .maybeSingle();
      setCustomHtml(data?.html ?? null);
    })();
  }, []);

  useEffect(() => {
    if (customHtml !== null || !isAnonymous) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("site_settings")
        .select("signin_points_threshold")
        .eq("id", 1)
        .maybeSingle();
      if (data?.signin_points_threshold != null) setThreshold(Number(data.signin_points_threshold));
    })();
  }, [customHtml, isAnonymous]);

  useEffect(() => {
    if (customHtml !== null || !isAnonymous || !playerId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("player_points")
        .select("points")
        .eq("player_id", playerId)
        .maybeSingle();
      setPoints(Number(data?.points ?? 0));
    })();
  }, [customHtml, isAnonymous, playerId]);

  useEffect(() => {
    if (customHtml !== null || !playerId) return;
    fetchStreakProtectionStatus().then((status) => {
      setStreakStatus(status);
      if (!status) return;
      // A player who was mid-repair last time we checked and no longer is
      // (without having played Daily themselves -- that always resets the
      // key too) had it cleared by their friends. Detected here rather than
      // in Daily.tsx since restoration is friend-triggered, not tied to any
      // action this player took.
      const lastStatus = localStorage.getItem(LAST_STATUS_KEY);
      if (lastStatus === "repair" && status.status !== "repair" && status.status !== "lost") {
        toast({
          title: "Streak restored! 🎉",
          description: `Your friends came through -- your ${status.current_streak}-day streak is safe.`,
        });
      }
      localStorage.setItem(LAST_STATUS_KEY, status.status);
    });
  }, [customHtml, playerId]);

  if (customHtml) {
    return <div dangerouslySetInnerHTML={{ __html: customHtml }} />;
  }

  if (streakStatus?.status === "repair") {
    return <StreakRepairNotification status={streakStatus} />;
  }

  if (
    !streakDismissed &&
    (streakStatus?.status === "at_risk" || streakStatus?.status === "save_available_today")
  ) {
    return (
      <StreakAtRiskNotification
        streak={streakStatus.current_streak}
        onDismiss={() => {
          sessionStorage.setItem(STREAK_DISMISS_KEY, lagosToday());
          setStreakDismissed(true);
        }}
      />
    );
  }

  if (!dismissed && isAnonymous && points !== null && points > threshold) {
    return (
      <SignInPointsNotification
        points={points}
        onDismiss={() => {
          sessionStorage.setItem(SIGNIN_DISMISS_KEY, "1");
          setDismissed(true);
        }}
      />
    );
  }

  return null;
}
