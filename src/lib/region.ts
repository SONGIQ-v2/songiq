// Rough visitor region from the device's time zone -- used to tailor which
// playlists the homepage features. Instant and private: no network request,
// no IP lookup. A traveller who hasn't changed their clock gets their home
// region, which is fine for a "what to feature" hint.

export type VisitorRegion =
  | "nigeria" // Africa/Lagos also covers much of West/Central Africa
  | "ghana"
  | "south-africa"
  | "east-africa"
  | "africa" // any other African time zone
  | "us"
  | "canada"
  | "uk"
  | "germany" // also Austria / Switzerland -- German-language charts
  | "sweden"
  | "australia"
  | "other";

const US = new Set([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "America/Detroit", "America/Boise",
  "America/Juneau", "America/Adak", "Pacific/Honolulu",
]);

const CANADA = new Set([
  "America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
  "America/Halifax", "America/St_Johns", "America/Regina", "America/Montreal",
]);

const EAST_AFRICA = new Set([
  "Africa/Nairobi", "Africa/Dar_es_Salaam", "Africa/Kampala", "Africa/Kigali", "Africa/Addis_Ababa",
]);

export function detectRegion(): VisitorRegion {
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "other";
  }
  if (tz === "Africa/Lagos") return "nigeria";
  if (tz === "Africa/Accra") return "ghana";
  if (tz === "Africa/Johannesburg") return "south-africa";
  if (EAST_AFRICA.has(tz)) return "east-africa";
  if (tz.startsWith("Africa/")) return "africa";
  if (tz === "Europe/London" || tz === "Europe/Dublin") return "uk";
  if (tz === "Europe/Berlin" || tz === "Europe/Vienna" || tz === "Europe/Zurich") return "germany";
  if (tz === "Europe/Stockholm") return "sweden";
  if (tz.startsWith("Australia/")) return "australia";
  if (CANADA.has(tz)) return "canada";
  if (
    US.has(tz) ||
    tz.startsWith("America/Indiana/") ||
    tz.startsWith("America/Kentucky/") ||
    tz.startsWith("America/North_Dakota/")
  ) {
    return "us";
  }
  return "other";
}

// Country-chart playlists (Apple Most Played feeds) that only make sense to
// lead with for their own region -- everyone else sees them further down.
export const COUNTRY_CHART_IDS = new Set([
  "trending-south-africa",
  "trending-uk",
  "trending-germany",
  "trending-sweden",
  "trending-australia",
  "trending-canada",
]);

// The first playlists shown in Solo Play's / the lobby's "All" list, per
// region. Regions not listed lead with the catalogue's own top four.
const DEFAULT_LEAD = ["trending-nigeria", "global-top-100", "afrobeats-chill", "amapiano-hits"];
export const LEAD_PLAYLISTS_BY_REGION: Partial<Record<VisitorRegion, string[]>> = {
  ghana: ["trending-ghana", "ghana-sounds", "afrobeats-chill", "trending-nigeria"],
  "south-africa": ["trending-south-africa", "amapiano-hits", "afrobeats-chill", "trending-nigeria"],
  "east-africa": ["east-africa-vibes", "afrobeats-chill", "amapiano-hits", "trending-nigeria"],
  us: ["global-top-100", "us-pop-hits", "us-hip-hop", "us-rnb"],
  canada: ["trending-canada", "global-top-100", "us-pop-hits", "us-hip-hop"],
  uk: ["trending-uk", "uk-drill-grime", "global-top-100", "us-pop-hits"],
  germany: ["trending-germany", "global-top-100", "us-pop-hits", "us-hip-hop"],
  sweden: ["trending-sweden", "global-top-100", "us-pop-hits", "us-rnb"],
  australia: ["trending-australia", "global-top-100", "us-pop-hits", "us-hip-hop"],
};

/**
 * The catalogue ordered for this visitor: their region's four lead
 * playlists first (fixed), then everything else shuffled -- genres and
 * artist spotlights mixed -- so returning visitors don't see the same list
 * every time. Other countries' charts go last, so e.g. "Trending Sweden"
 * isn't near the top for a visitor from Lagos. Callers compute this once
 * per page load, so the order holds steady while someone browses.
 */
export function orderPlaylistsForRegion<T extends { id: string }>(playlists: T[], region: VisitorRegion): T[] {
  const leadIds = LEAD_PLAYLISTS_BY_REGION[region] ?? DEFAULT_LEAD;
  const lead = leadIds
    .map((id) => playlists.find((p) => p.id === id))
    .filter((p): p is T => !!p);
  const remaining = playlists.filter((p) => !lead.includes(p));
  const foreignCharts = remaining.filter((p) => COUNTRY_CHART_IDS.has(p.id));
  const shuffled = remaining
    .filter((p) => !COUNTRY_CHART_IDS.has(p.id))
    .map((p) => ({ p, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map(({ p }) => p);
  return [...lead, ...shuffled, ...foreignCharts];
}
