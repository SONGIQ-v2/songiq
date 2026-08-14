// Fires a named event to every wired-up analytics destination from one call
// site. GTM (GA4) gets it via dataLayer, as before. Meta Pixel is wired in
// directly (not through GTM, by choice): a client-side fbq('trackCustom', ...)
// call, plus a server-side relay to Meta's Conversions API for better match
// quality and resilience to ad blockers. Both share the same event_id so
// Meta dedupes them as one event instead of double-counting.
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    fbq?: (...args: unknown[]) => void;
  }
}

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function trackEvent(event: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });

  const eventId = crypto.randomUUID();
  window.fbq?.("trackCustom", event, params, { eventID: eventId });

  // Best-effort — a CAPI relay failure should never affect gameplay.
  supabase.functions
    .invoke("meta-capi", {
      body: {
        event_name: event,
        event_id: eventId,
        custom_data: params,
        event_source_url: window.location.href,
        fbp: getCookie("_fbp"),
        fbc: getCookie("_fbc"),
        player_id: useGameStore.getState().playerId ?? undefined,
      },
    })
    .catch(() => {});
}
