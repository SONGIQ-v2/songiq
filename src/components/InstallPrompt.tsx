import { useState, useEffect } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInstallPromptSupport, promptInstall } from "@/lib/pwaInstall";

const DISMISS_KEY = "songiq_install_dismissed";

/**
 * "Install SongIQ" -- a real Install button on Chromium (Android/desktop),
 * or manual "Add to Home Screen" instructions on iOS (no browser there,
 * Safari or otherwise, exposes an install API -- see pwaInstall.ts). Hides
 * itself entirely once installed, unsupported, or dismissed.
 */
export function InstallPrompt({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"hidden" | "available" | "ios">("hidden");

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    const support = getInstallPromptSupport();
    if (support === "available") setState("available");
    if (support === "ios_manual") setState("ios");
    // Chromium fires beforeinstallprompt asynchronously, sometime after
    // load -- re-check shortly after mount in case it lands late.
    const id = setTimeout(() => {
      if (getInstallPromptSupport() === "available") setState("available");
    }, 2000);
    return () => clearTimeout(id);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setState("hidden");
  };

  if (state === "hidden") return null;

  if (state === "ios") {
    return (
      <div className={`raised-panel p-4 text-left ${className}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-2">
              <Share className="w-4 h-4 text-primary" />
              Install SongIQ on your iPhone
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Tap the Share icon in Safari's toolbar</li>
              <li>Scroll down and tap "Add to Home Screen"</li>
            </ol>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground text-lg leading-none shrink-0"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`raised-panel flex items-center justify-between gap-4 flex-wrap p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-card/60 border border-border flex items-center justify-center shrink-0">
          <Download className="w-4 h-4 text-foreground" />
        </div>
        <div>
          <p className="font-bold text-foreground">Install SongIQ</p>
          <p className="text-sm text-muted-foreground">Faster access, right from your home screen</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={dismiss} className="text-sm text-muted-foreground hover:text-foreground">
          Not now
        </button>
        <Button
          variant="gold"
          onClick={async () => {
            const outcome = await promptInstall();
            if (outcome !== "unavailable") setState("hidden");
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          Install App
        </Button>
      </div>
    </div>
  );
}
