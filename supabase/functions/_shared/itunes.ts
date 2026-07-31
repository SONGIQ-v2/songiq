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
const JUNK_PATTERN = /karaoke|tribute|made famous|originally performed|cover version|in the style of|type beat|glee cast/i;

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
  const response = await fetch(url);
  const data = await response.json();
  return (data.results ?? []) as ArtistLookupResult[];
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
  // together with "/" (remix/edit tags on one song are fine).
  const isAuthoredBy = (an: string) =>
    an === artistName || an.startsWith(`${artistName} `) || an.startsWith(`${artistName},`);
  const isMashupTitle = (title: string) => /\//.test(title);
  return pool.filter((t) => isAuthoredBy(t.artistName) && !isMashupTitle(t.trackName));
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
  // still leaves a healthy pool.
  const tracksPerTerm = Math.max(3, Math.ceil((targetSize * 2) / usedTerms.length));

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

  const pool = allTracks.filter(
    (track, index, self) => index === self.findIndex((t) => t.trackId === track.trackId)
  );

  const image = pool.length > 0
    ? pool[0].artworkUrl100.replace("100x100", "600x600")
    : "";

  return { pool, image };
}
