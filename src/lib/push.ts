// Web push subscription for Daily Challenge reminders.

import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/clientLogger";
import { trackEvent } from "@/lib/analytics";

export type PushSupport = "supported" | "ios_needs_install" | "unsupported";

/** iOS Safari only allows web push for sites installed to the home screen. */
export function getPushSupport(): PushSupport {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (isIOS && !standalone) return "ios_needs_install";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
    return "supported";
  }
  return "unsupported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function isSubscribed(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/**
 * Subscribe this browser to daily reminders. Returns "subscribed",
 * "denied" (user refused the permission prompt), "not_ready" (server keys
 * not generated yet — first cron run pending) or "failed".
 */
export async function subscribeToDailyReminders(
  playerId: string
): Promise<"subscribed" | "denied" | "not_ready" | "failed"> {
  try {
    const { data: publicKey } = await (supabase as any).rpc("get_vapid_public_key");
    if (!publicKey) return "not_ready";

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "failed";

    const { error } = await (supabase as any).from("push_subscriptions").upsert(
      {
        player_id: playerId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;

    trackEvent("push_subscribe");
    return "subscribed";
  } catch (e) {
    logError("push.subscribe_failed", "Failed to subscribe to daily reminders", {
      error: (e as Error)?.message,
    });
    return "failed";
  }
}
