import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DISMISS_KEY = "songiq_signin_hint_dismissed";

/**
 * Whether to show a "sign in to save your progress" hint: true only for
 * anonymous players who haven't dismissed it. One shared dismiss key across
 * every hint surface (leaderboard, daily streak, ...) -- saying "not now"
 * once shouldn't mean getting asked again on the next page.
 */
export function useSignInHint(): { show: boolean; dismiss: () => void } {
  // Default true (assume anonymous) -- matches Header.tsx's own default, so
  // the hint is visible-by-default during the brief async session check
  // rather than hidden-by-default (which, if getSession() ever silently
  // failed, would strand it hidden forever).
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1"
  );

  useEffect(() => {
    const applySession = (user: { is_anonymous?: boolean } | null) => {
      setIsAnonymous(user?.is_anonymous ?? true);
    };
    supabase.auth.getSession()
      .then(({ data }) => applySession(data.session?.user ?? null))
      .catch((err) => {
        console.error("useSignInHint: getSession failed:", err);
        setIsAnonymous(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => applySession(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return { show: isAnonymous && !dismissed, dismiss };
}
