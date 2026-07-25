// Pushes a named event into GTM's dataLayer. This file's only job is
// telling GTM something happened — which destinations (GA4, Meta Pixel,
// etc.) react to a given event name is configured entirely inside the GTM
// container, so adding a new destination later needs no code change here.
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function trackEvent(event: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}
