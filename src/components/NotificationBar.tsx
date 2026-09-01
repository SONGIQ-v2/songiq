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
 * always wins when one exists. Otherwise, an anonymous player with over 200
 * lifetime points sees the sign-in warning -- a hard floor the admin can't
 * turn off, since it isn't stored as a togglable row (see the admin
 * Notifications tab's info line).
 */
export function NotificationBar({ isAnonymous }: { isAnonymous: boolean }) {
  const { playerId } = useGameStore();
  const [customHtml, setCustomHtml] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
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

  if (!dismissed && isAnonymous && points !== null && points > 200) {
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
