// Shared iTunes Search API helpers used by the apple-music and
// refresh-playlists edge functions.

export interface iTunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl: string;
  trackTimeMillis: number;
  primaryGenreName: string;
}

interface iTunesSearchResponse {
  resultCount: number;
  results: iTunesTrack[];
}

// Karaoke/tribute/cover junk that pollutes iTunes text search results
const JUNK_PATTERN = /karaoke|tribute|made famous|originally performed|cover version|in the style of/i;

// Search iTunes for tracks (only those with playable previews, no karaoke junk)
export async function searchTracks(query: string, limit: number = 50): Promise<iTunesTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
  const response = await fetch(url);
  const data: iTunesSearchResponse = await response.json();
  return data.results.filter(
    (track) =>
      track.previewUrl &&
      !JUNK_PATTERN.test(track.artistName) &&
      !JUNK_PATTERN.test(track.collectionName || "")
  );
}

// Cap how many terms we search to keep latency and API load bounded.
export const MAX_TERMS = 25;

// Playlists whose first "search term" carries this prefix are chart-driven:
// the pool comes from Apple's official Most Played feed for a storefront
// (e.g. "__chart:ng") instead of artist searches.
export const CHART_TERM_PREFIX = "__chart:";

// Fetch a storefront's Most Played chart and resolve playable previews.
export async function fetchChartPool(
  storefront: string
): Promise<{ pool: iTunesTrack[]; image: string }> {
  const feedUrl = `https://rss.marketingtools.apple.com/api/v2/${storefront}/music/most-played/100/songs.json`;
  const feedRes = await fetch(feedUrl, { redirect: "follow" });
  const feed = await feedRes.json();
  const ids: string[] = (feed?.feed?.results ?? [])
    .map((r: { id?: string }) => r.id)
    .filter(Boolean);
  if (ids.length === 0) return { pool: [], image: "" };

  const pool: iTunesTrack[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(",");
    try {
      const res = await fetch(
        `https://itunes.apple.com/lookup?id=${batch}&country=${storefront.toUpperCase()}`
      );
      const data = await res.json();
      for (const t of (data.results ?? []) as iTunesTrack[]) {
        if (t.previewUrl && t.trackId) pool.push(t);
      }
    } catch (e) {
      console.error(`[iTunes] Chart lookup failed for ${storefront}:`, e);
    }
  }

  const unique = pool.filter(
    (track, index, self) => index === self.findIndex((t) => t.trackId === track.trackId)
  );
  const image = unique[0]?.artworkUrl100?.replace("100x100", "600x600") ?? "";
  console.log(`[iTunes] Chart "${storefront}": ${unique.length} playable tracks`);
  return { pool: unique, image };
}

/**
 * Build a playlist's full track pool: parallel iTunes searches across the
 * playlist's artist terms, deduplicated. Returns the whole pool (typically
 * 80-100+ tracks) — callers shuffle and slice per request, so a cached pool
 * still yields varied games.
 */
export async function fetchPlaylistPool(
  searchTerms: string[],
  targetSize: number = 50
): Promise<{ pool: iTunesTrack[]; image: string }> {
  // Chart-driven playlist? Route to the Most Played feed.
  if (searchTerms[0]?.startsWith(CHART_TERM_PREFIX)) {
    return fetchChartPool(searchTerms[0].slice(CHART_TERM_PREFIX.length));
  }

  const usedTerms = searchTerms.length > MAX_TERMS
    ? [...searchTerms].sort(() => Math.random() - 0.5).slice(0, MAX_TERMS)
    : searchTerms;

  // Ensure each term returns enough candidates that dedup + preview filtering
  // still leaves a healthy pool.
  const tracksPerTerm = Math.max(3, Math.ceil((targetSize * 2) / usedTerms.length));

  const results = await Promise.allSettled(
    usedTerms.map((term) => searchTracks(term, tracksPerTerm))
  );

  const allTracks: iTunesTrack[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      allTracks.push(...r.value);
    } else {
      console.error("[iTunes] Search failed:", r.reason);
    }
  }

  const pool = allTracks.filter(
    (track, index, self) => index === self.findIndex((t) => t.trackId === track.trackId)
  );

  const image = pool.length > 0
    ? pool[0].artworkUrl100.replace("100x100", "600x600")
    : "";

  return { pool, image };
}
