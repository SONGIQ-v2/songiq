import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { SignInPointsNotification } from "@/components/SignInPointsNotification";

const SIGNIN_DISMISS_KEY = "songiq_notif_signin_dismissed";

/**
 * Rendered by Header.tsx, above the nav row. isAnonymous comes from Header
 * (which already tracks it) rather than re-checking the session here too --
 * Header, useSignInHint, and gameStore's auth listener each already do their
 * own copy of this same check; this avoids a 4th.
 *
 * Precedence: an active admin-authored notification (site_notifications)
 * always wins when one exists. Otherwise, an anonymous player over the
 * admin-configurable points threshold (site_settings.signin_points_threshold,
 * Notifications tab) sees the sign-in warning -- a hard floor the admin can't
 * turn off entirely, since it isn't stored as a togglable row (see the admin
 * Notifications tab's info line) -- only its threshold is configurable.
 */
export function NotificationBar({ isAnonymous }: { isAnonymous: boolean }) {
  const { playerId } = useGameStore();
  const [customHtml, setCustomHtml] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(200);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SIGNIN_DISMISS_KEY) === "1"
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

  if (customHtml) {
    return <div dangerouslySetInnerHTML={{ __html: customHtml }} />;
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
