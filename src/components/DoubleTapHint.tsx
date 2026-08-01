import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";

const STORAGE_KEY = "songiq_dismissed_double_tap_hint";

/** Mobile-only, dismiss-once tip teaching the double-tap-to-start gesture
 *  on playlist cards. Shared key so dismissing it on one page (Solo Play,
 *  Room Lobby) hides it everywhere else too. */
export const DoubleTapHint = () => {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (dismissed) return null;

  return (
    <div className="sm:hidden flex items-center gap-2.5 bg-primary/10 border border-primary/30 rounded-xl px-4 py-2.5 mb-4 text-sm">
      <Sparkles className="w-4 h-4 text-primary shrink-0" />
      <p className="flex-1 text-foreground/90">
        <strong className="text-primary font-semibold">Tip:</strong> double-tap a playlist to jump straight in
      </p>
      <button
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss tip"
        className="text-muted-foreground hover:text-foreground shrink-0 p-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
