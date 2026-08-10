import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGameStore } from "@/lib/gameStore";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "@/hooks/use-toast";

const PENDING_MERGE_KEY = "songiq_pending_merge_token";

/**
 * Mounted once, globally (see App.tsx), so any page can open it via
 * useGameStore's openSignInModal() -- not just wherever Header happens to
 * be rendered.
 */
export function SignInModal() {
  const { showSignInModal, closeSignInModal } = useGameStore();
  const [signingIn, setSigningIn] = useState(false);

  // Claims a merge staged before sign-in (see handleSignIn) once a real
  // session shows up. The listener is always active (not just when a token
  // already exists at mount) because staging can happen either before this
  // component mounts -- Lovable's OAuth flow does a full-page redirect on a
  // normal browser tab, so a token set right before redirecting is picked
  // up fresh on the next page load -- or after, in the popup/iframe case,
  // where the session swap happens in the same page load. Reading
  // localStorage fresh inside tryClaim (rather than once, at effect setup)
  // covers both. claim_anonymous_merge() is itself single-use server-side,
  // so a duplicate call here (e.g. both getSession() and the auth-change
  // event firing for the same token) is a harmless no-op, not double-merge.
  useEffect(() => {
    let inFlightToken: string | null = null;
    const tryClaim = async (user: { is_anonymous?: boolean } | null | undefined) => {
      if (!user || user.is_anonymous) return;
      const pendingToken = localStorage.getItem(PENDING_MERGE_KEY);
      if (!pendingToken || pendingToken === inFlightToken) return;
      inFlightToken = pendingToken;
      localStorage.removeItem(PENDING_MERGE_KEY);
      const { error } = await (supabase as any).rpc("claim_anonymous_merge", { p_token: pendingToken });
      if (error) {
        console.error("claim_anonymous_merge failed:", error.message);
        return;
      }
      toast({ title: "Signed in!", description: "Your previous progress has been added to your account." });
    };

    supabase.auth.getSession().then(({ data }) => tryClaim(data.session?.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => tryClaim(s?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const hadAnonymousSession = session?.user?.is_anonymous ?? false;
      let staged = false;
      if (hadAnonymousSession) {
        const { data: token } = await (supabase as any).rpc("stage_anonymous_merge");
        if (token) {
          localStorage.setItem(PENDING_MERGE_KEY, token as string);
          staged = true;
        }
      }

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        console.error("Sign-in failed:", result.error);
        if (staged) localStorage.removeItem(PENDING_MERGE_KEY);
        toast({
          title: "Couldn't sign in",
          description: "Google sign-in failed. Please try again.",
          variant: "destructive",
        });
        return;
      }
      if (result.redirected) return;
      closeSignInModal();
      // If a token was staged, the merge effect above shows its own
      // "Signed in!" toast once it actually merges the anonymous progress.
      if (!staged) {
        toast({ title: "Signed in!", description: "Your progress is now saved to your account." });
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <Dialog open={showSignInModal} onOpenChange={(open) => !open && closeSignInModal()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Sign in to <span className="text-gold">SONGIQ</span>
          </DialogTitle>
          <DialogDescription>
            Your Points, streaks and leaderboard spot only live on this device —
            clear your browser or switch phones and they're gone for good.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={signingIn}
            onClick={handleSignIn}
          >
            <svg className="w-5 h-5 mr-2 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </Button>
        </div>
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground pt-1">
          You can keep playing without an account
        </p>
      </DialogContent>
    </Dialog>
  );
}
