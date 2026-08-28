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
  releaseDate?: string;
}

interface iTunesSearchResponse {
  resultCount: number;
  results: iTunesTrack[];
}

// Karaoke/tribute/cover junk that pollutes iTunes text search results
const JUNK_PATTERN = /karaoke|tribute|made famous|originally performed|cover version|in the style of|type beat|glee cast/i;

// Artists confirmed on inspection to be unrelated to any playlist here — they
// only turn up because they feature one of our search terms on an otherwise
// unrelated song (e.g. Ragheb Alama, a Lebanese pop artist, surfaced by a
// Naija Throwback search for "seyi shay" via his "Yalla Habibi" feature).
const EXCLUDED_ARTIST_PATTERN = /ragheb alama/i;

// Releases confirmed on inspection to be a *different* artist entirely, whom
// Apple's own catalog has merged onto an unrelated artist's exact iTunes
// artist ID/name -- unlike EXCLUDED_ARTIST_PATTERN above, artistName-based
// filtering can't catch these since the credited name really is identical.
// (e.g. a Mandopop act also using the stage name "Asa" -- its "Xing Fu Juan
// Gu" EP and "Transform Syndrome" single/collab are filed under artist ID
// 26089928, the same ID as the Nigerian singer Aṣa.)
const EXCLUDED_COLLECTION_PATTERN = /xing fu juan gu|blütenstand|transform syndrome/i;

// DJ mixtape/compilation "tracks" credited to an artist because they're
// sampled/featured somewhere inside a much longer mix -- these aren't a
// standalone song by the artist, so their preview clip would just be a
// random slice of someone else's set. Broad enough to catch every artist-
// spotlight playlist, not just one.
const isDjMixCollection = (collectionName: string) => /\bDJ Mix\b/i.test(collectionName);

// iTunes/Apple endpoints return a plain-text "Rate limit exceeded" body (not
// JSON) when throttling us -- calling response.json() directly on that
// crashes with a SyntaxError instead of failing gracefully. But on success
// these endpoints always serve valid JSON as "Content-Type: text/javascript",
// never "application/json" -- so Content-Type can't distinguish a real
// response from a rate-limited one. Parse by content instead: a successful
// body parses as JSON regardless of its (always-wrong) header, and a
// rate-limited plain-text body fails to parse and falls back to null.
async function safeFetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(url, init);
  if (!response.ok) {
    console.error(`[iTunes] Non-OK response (status ${response.status}) for ${url} -- likely rate-limited`);
    return null;
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.error(`[iTunes] Non-JSON response for ${url} -- likely rate-limited: ${text.slice(0, 100)}`);
    return null;
  }
}

// Search iTunes for tracks (only those with playable previews, no karaoke junk)
export async function searchTracks(query: string, limit: number = 50): Promise<iTunesTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
  const data = await safeFetchJson<iTunesSearchResponse>(url);
  return (data?.results ?? []).filter(
    (track) =>
      track.previewUrl &&
      !JUNK_PATTERN.test(track.artistName) &&
      !JUNK_PATTERN.test(track.collectionName || "") &&
      !EXCLUDED_ARTIST_PATTERN.test(track.artistName)
  );
}

// Cap how many terms we search to keep latency and API load bounded.
export const MAX_TERMS = 25;

// Playlists never used for the Daily Challenge -- shared by cleanup-stale-rooms
// (the automatic generator) and admin-daily-challenge (the manual override),
// so both agree on what's eligible without a second hand-kept list to drift.
export const DAILY_EXCLUDED = new Set(["East Africa Vibes", "Ghana Sounds", "CacheProbe"]);

export interface PlanRound {
  track_id: string;
  track_name: string;
  artist_name: string;
  preview_url: string;
  artwork_url: string;
  question_type: "song" | "artist";
  options: string[];
}

// Build a playable round plan (question type + 4 options per round) from a
// track pool. Mirrors the client-side multiplayer plan builder.
export function buildRoundPlanFromPool(
  pool: iTunesTrack[],
  rounds: number,
  isArtistPlaylist = false
): PlanRound[] {
  // An artist-spotlight playlist is only ever "Guess the Song" — features/
  // collabs can make the pool's artist names look diverse enough for
  // "Guess the Artist" to technically work, but that defeats the point of
  // an artist playlist. Any other narrow pool still falls back via the
  // diversity check below as a safety net.
  const uniqueArtists = new Set(pool.map((t) => t.artistName)).size;
  const canGuessArtist = !isArtistPlaylist && uniqueArtists >= 4;

  const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, rounds);
  return picks.map((track) => {
    const isGuessSong = !canGuessArtist || Math.random() > 0.5;

    let options: string[];
    if (isGuessSong) {
      const others = pool
        .filter((t) => t.trackId !== track.trackId && t.trackName !== track.trackName)
        .map((t) => t.trackName)
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      options = [track.trackName, ...others].sort(() => Math.random() - 0.5);
    } else {
      const others = pool
        .filter((t) => t.trackId !== track.trackId && t.artistName !== track.artistName)
        .map((t) => t.artistName)
        .filter((a, i, arr) => arr.indexOf(a) === i)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      options = [track.artistName, ...others].sort(() => Math.random() - 0.5);
    }

    return {
      track_id: String(track.trackId),
      track_name: track.trackName,
      artist_name: track.artistName,
      preview_url: track.previewUrl,
      artwork_url: track.artworkUrl100?.replace("100x100", "600x600") || "",
      question_type: isGuessSong ? "song" as const : "artist" as const,
      options,
    };
  });
}

// Terms with this prefix reference an exact iTunes artist ID instead of a
// text search — immune to same-name collisions (O-Zone/Eben/Reminisce class
// bugs). Format: "__artist:<id>"
export const ARTIST_TERM_PREFIX = "__artist:";

type ArtistLookupResult =
  | (iTunesTrack & { wrapperType?: string })
  | { wrapperType: "artist"; artistName: string };

async function fetchArtistLookupResults(artistId: string, limit: number): Promise<ArtistLookupResult[]> {
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&entity=song&limit=${limit + 1}`;
  const data = await safeFetchJson<{ results: ArtistLookupResult[] }>(url);
  return data?.results ?? [];
}

// Fetch an artist's top songs by their exact iTunes artist ID.
export async function lookupArtistSongs(artistId: string, limit: number): Promise<iTunesTrack[]> {
  const results = await fetchArtistLookupResults(artistId, limit);
  return (results as (iTunesTrack & { wrapperType?: string })[])
    .filter((r) => r.wrapperType === "track" && r.previewUrl)
    .slice(0, limit);
}

// Used only for single-artist spotlight playlists (see fetchPlaylistPool) to
// keep only songs the artist actually authored. Not applied to __artist:
// terms mixed into a broader genre playlist (e.g. Nigerian Gospel) — there,
// a plain "(feat. X)" credit on another artist's song is legitimate genre
// content, not junk to filter out.
function keepAuthoredTracks(pool: iTunesTrack[], artistName: string): iTunesTrack[] {
  // The artist must be first-billed — solo, or "Artist Featuring X" / "Artist,
  // X & Y" — to count as the author. Second-billed joint credits (e.g.
  // "Calvin Harris & Rihanna") are someone else's song, even though the
  // artist's name is genuinely in there. The Lookup API also pads results
  // with DJ mashup/compilation tracks that credit the artist jointly; the
  // tell there is the title, which splices multiple different songs
  // together with "/".
  const isAuthoredBy = (an: string) =>
    an === artistName || an.startsWith(`${artistName} `) || an.startsWith(`${artistName},`);
  const isMashupTitle = (title: string) => /\//.test(title);
  // Alternate mixes/edits (club remixes, radio edits, extended mixes) are
  // still credited solely to the artist, but are near-duplicate clutter of
  // a song already in the pool under its plain title — drop any title with
  // a "(...)"/"[...]" tag naming one, keeping only the plain version.
  const isAltMixTitle = (title: string) =>
    /\((?:[^)]*\b(?:remix|mix|mixed|edit|dub|dubb|rmx|vip)\b[^)]*)\)|\[(?:[^\]]*\b(?:remix|mix|mixed|edit|dub|dubb|rmx|vip)\b[^\]]*)\]/i.test(
      title
    );
  return pool.filter(
    (t) =>
      isAuthoredBy(t.artistName) &&
      !isMashupTitle(t.trackName) &&
      !isAltMixTitle(t.trackName) &&
      !isDjMixCollection(t.collectionName || "") &&
      !EXCLUDED_COLLECTION_PATTERN.test(t.collectionName || "")
  );
}

// Playlists whose first "search term" carries this prefix are chart-driven:
// the pool comes from Apple's official Most Played feed for a storefront
// (e.g. "__chart:ng") instead of artist searches.
export const CHART_TERM_PREFIX = "__chart:";

// Fetch a storefront's Most Played chart and resolve playable previews.
export async function fetchChartPool(
  storefront: string
): Promise<{ pool: iTunesTrack[]; image: string }> {
  const feedUrl = `https://rss.marketingtools.apple.com/api/v2/${storefront}/music/most-played/100/songs.json`;
  const feed = await safeFetchJson<{ feed?: { results?: { id?: string }[] } }>(feedUrl, { redirect: "follow" });
  const ids = (feed?.feed?.results ?? [])
    .map((r: { id?: string }) => r.id)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { pool: [], image: "" };

  const pool: iTunesTrack[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(",");
    try {
      const data = await safeFetchJson<{ results: iTunesTrack[] }>(
        `https://itunes.apple.com/lookup?id=${batch}&country=${storefront.toUpperCase()}`
      );
      for (const t of data?.results ?? []) {
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

// An era playlist (e.g. Naija Throwback) can carry one extra search term of
// the form "__yearrange:<minYear|empty>:<maxYear>" to restrict its pool to a
// release-year window — e.g. "__yearrange:2004:2020" or "__yearrange::2005"
// for no lower bound. Not a real search term: extracted and removed from the
// list before searching, then applied as a post-filter on the merged pool.
export const YEAR_RANGE_TERM_PREFIX = "__yearrange:";

interface YearRange {
  minYear: number | null;
  maxYear: number;
}

function extractYearRange(searchTerms: string[]): { yearRange: YearRange | null; terms: string[] } {
  const idx = searchTerms.findIndex((t) => t.startsWith(YEAR_RANGE_TERM_PREFIX));
  if (idx === -1) return { yearRange: null, terms: searchTerms };

  const terms = [...searchTerms.slice(0, idx), ...searchTerms.slice(idx + 1)];
  const [minStr, maxStr] = searchTerms[idx].slice(YEAR_RANGE_TERM_PREFIX.length).split(":");
  const maxYear = parseInt(maxStr, 10);
  if (!Number.isFinite(maxYear)) return { yearRange: null, terms };
  const minYear = minStr ? parseInt(minStr, 10) : null;
  return {
    yearRange: { minYear: minYear !== null && Number.isFinite(minYear) ? minYear : null, maxYear },
    terms,
  };
}

// A track with no releaseDate can't be verified as in-window, so it's
// dropped rather than assumed eligible.
function withinYearRange(track: iTunesTrack, range: YearRange): boolean {
  if (!track.releaseDate) return false;
  const year = new Date(track.releaseDate).getUTCFullYear();
  if (!Number.isFinite(year)) return false;
  if (year > range.maxYear) return false;
  if (range.minYear !== null && year < range.minYear) return false;
  return true;
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
  const { yearRange, terms: termsWithoutYearRange } = extractYearRange(searchTerms);
  searchTerms = termsWithoutYearRange;

  // Chart-driven playlist? Route to the Most Played feed.
  if (searchTerms[0]?.startsWith(CHART_TERM_PREFIX)) {
    return fetchChartPool(searchTerms[0].slice(CHART_TERM_PREFIX.length));
  }

  // A single-artist spotlight playlist (an exact artist-ID reference, no
  // other terms) — pull the deepest catalog the iTunes Lookup API allows
  // (200, its hard cap) instead of the multi-term averaging formula below,
  // which is tuned for blending many different artists' search results.
  if (searchTerms.length === 1 && searchTerms[0].startsWith(ARTIST_TERM_PREFIX)) {
    const artistId = searchTerms[0].slice(ARTIST_TERM_PREFIX.length);
    const results = await fetchArtistLookupResults(artistId, 200);
    const rawPool = (results as (iTunesTrack & { wrapperType?: string })[])
      .filter((r) => r.wrapperType === "track" && r.previewUrl)
      .slice(0, 200);
    const artistRecord = results.find((r) => r.wrapperType === "artist") as { artistName?: string } | undefined;
    const pool = artistRecord?.artistName ? keepAuthoredTracks(rawPool, artistRecord.artistName) : rawPool;
    const image = pool[0]?.artworkUrl100?.replace("100x100", "600x600") ?? "";
    console.log(`[iTunes] Artist spotlight: ${pool.length} playable tracks`);
    return { pool, image };
  }

  const usedTerms = searchTerms.length > MAX_TERMS
    ? [...searchTerms].sort(() => Math.random() - 0.5).slice(0, MAX_TERMS)
    : searchTerms;

  // Ensure each term returns enough candidates that dedup + preview filtering
  // still leaves a healthy pool. A year-range playlist needs a much deeper
  // fetch per term since most of an artist's top results get discarded by
  // the release-year filter below.
  const tracksPerTerm = yearRange
    ? Math.max(20, Math.ceil((targetSize * 4) / usedTerms.length))
    : Math.max(3, Math.ceil((targetSize * 2) / usedTerms.length));

  const results = await Promise.allSettled(
    usedTerms.map((term) =>
      term.startsWith(ARTIST_TERM_PREFIX)
        ? lookupArtistSongs(term.slice(ARTIST_TERM_PREFIX.length), tracksPerTerm)
        : searchTracks(term, tracksPerTerm)
    )
  );

  const allTracks: iTunesTrack[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      allTracks.push(...r.value);
    } else {
      console.error("[iTunes] Search failed:", r.reason);
    }
  }

  let pool = allTracks.filter(
    (track, index, self) => index === self.findIndex((t) => t.trackId === track.trackId)
  );

  if (yearRange) {
    pool = pool.filter((t) => withinYearRange(t, yearRange));
  }

  const image = pool.length > 0
    ? pool[0].artworkUrl100.replace("100x100", "600x600")
    : "";

  return { pool, image };
}
