// Custom "Install SongIQ" prompt -- captures Chromium's beforeinstallprompt
// event at module scope (registered once, regardless of when a consuming
// component mounts, same pattern as gameStore.ts's module-scope auth
// listener) so the banner can show up immediately once it's eligible.

import { trackEvent } from "@/lib/analytics";

// Not in TS's standard lib types -- Chromium-only, non-standard event.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Chrome only fires beforeinstallprompt once a service worker is actually
// registered for the page -- previously that only happened as a side effect
// of clicking "Remind me tomorrow" (src/lib/push.ts), so most visitors were
// never even eligible for the install prompt. Registering it here too, at
// app startup, is silent (no permission prompt, unlike Notification.request
// Permission) and idempotent -- push.ts's own register() call later just
// resolves against this same registration instead of creating a new one.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // suppress the browser's own generic mini-infobar
  deferredPrompt = e as BeforeInstallPromptEvent;
});

// Cleared once installed -- so a dangling deferredPrompt from before
// install can't be re-prompted (its own userChoice is already spent anyway,
// but this also flips isStandalone() sooner than a display-mode re-check).
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  trackEvent("pwa_installed");
});

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export type InstallPromptSupport = "available" | "ios_manual" | "unsupported";

/** "available" = real Install button (Chromium/Android/desktop). "ios_manual"
 *  = no install API exists at all on iOS (Safari or otherwise -- every iOS
 *  browser is WebKit under the hood), so only manual instructions are
 *  possible. "unsupported" = already installed, or the browser doesn't
 *  support installing (or hasn't fired the eligibility event yet). */
export function getInstallPromptSupport(): InstallPromptSupport {
  if (isStandalone()) return "unsupported";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios_manual";
  return deferredPrompt ? "available" : "unsupported";
}

/** Shows the real OS install dialog. Only valid when support is "available". */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const promptEvent = deferredPrompt;
  deferredPrompt = null; // a captured prompt can only be used once
  await promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  trackEvent("pwa_install_prompt", { outcome });
  return outcome;
}
