import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/analytics";

/**
 * gtag.js only auto-sends the initial page_view. This mirrors client-side route
 * changes into GA4 so every screen shows up in Reports → Pages and screens.
 */
export const AnalyticsRouteTracker = () => {
  const location = useLocation();

  useEffect(() => {
    // let the route render (and set its <title>) before reporting
    const id = window.setTimeout(() => {
      trackPageView(location.pathname + location.search);
    }, 60);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.search]);

  return null;
};
