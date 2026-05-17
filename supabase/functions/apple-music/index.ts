import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface iTunesTrack {
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

// Search iTunes for tracks
async function searchTracks(query: string, limit: number = 50): Promise<iTunesTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
  
  console.log(`[Apple Music] Searching for: ${query}`);
  
  const response = await fetch(url);
  const data: iTunesSearchResponse = await response.json();
  
  console.log(`[Apple Music] Found ${data.resultCount} results`);
  
  // Filter for tracks with preview URLs
  const tracksWithPreviews = data.results.filter(track => track.previewUrl);
  console.log(`[Apple Music] ${tracksWithPreviews.length} tracks have preview URLs`);
  
  return tracksWithPreviews;
}

// Get tracks by genre/category
async function getTracksByGenre(genre: string, limit: number = 50): Promise<iTunesTrack[]> {
  const genreSearchTerms: Record<string, string[]> = {
    afrobeats: ["afrobeats", "wizkid", "burna boy", "davido", "rema", "tems", "ckay", "fireboy dml"],
    amapiano: ["amapiano", "kabza de small", "dj maphorisa", "focalistic", "uncle waffles"],
    highlife: ["highlife", "fela kuti", "king sunny ade", "ebenezer obey"],
    bongoFlava: ["bongo flava", "diamond platnumz", "harmonize", "rayvanny"],
    naija: ["naija music", "nigerian music", "afro pop nigeria"],
    genge: ["genge", "gengetone", "kenyan music", "sauti sol"],
    afroClassics: ["african classics", "miriam makeba", "youssou ndour", "salif keita"],
    hiplife: ["hiplife", "sarkodie", "shatta wale", "stonebwoy"],
  };

  const searchTerms = genreSearchTerms[genre] || [genre];
  const allTracks: iTunesTrack[] = [];

  for (const term of searchTerms.slice(0, 3)) {
    const tracks = await searchTracks(term, Math.ceil(limit / 3));
    allTracks.push(...tracks);
  }

  const uniqueTracks = allTracks.filter((track, index, self) =>
    index === self.findIndex(t => t.trackId === track.trackId)
  );

  console.log(`[Apple Music] Genre "${genre}": ${uniqueTracks.length} unique tracks with previews`);
  
  return uniqueTracks.slice(0, limit);
}

// Get curated playlist-like results
async function getPlaylistTracks(
  searchTerms: string[], 
  playlistName: string,
  limit: number = 50
): Promise<{
  playlistName: string;
  playlistImage: string;
  tracks: iTunesTrack[];
}> {
  console.log(`[Apple Music] Fetching playlist tracks for: ${playlistName} (${searchTerms.length} terms)`);

  // Cap how many terms we actually search to keep latency bounded.
  // With many terms we'd otherwise do 50+ sequential iTunes calls and time out the client invoke.
  const MAX_TERMS = 25;
  const usedTerms = searchTerms.length > MAX_TERMS
    ? [...searchTerms].sort(() => Math.random() - 0.5).slice(0, MAX_TERMS)
    : searchTerms;

  // Ensure each term returns enough candidates so post-preview-filter + dedup leaves us with `limit` tracks.
  const tracksPerTerm = Math.max(3, Math.ceil((limit * 2) / usedTerms.length));

  // Run all iTunes searches in PARALLEL — sequential was the source of the 30s+ start-game timeouts.
  const results = await Promise.allSettled(
    usedTerms.map((term) => searchTracks(term, tracksPerTerm))
  );

  const allTracks: iTunesTrack[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allTracks.push(...r.value);
    } else {
      console.error(`[Apple Music] Search failed:`, r.reason);
    }
  }

  const uniqueTracks = allTracks.filter((track, index, self) =>
    index === self.findIndex(t => t.trackId === track.trackId)
  );

  const shuffledTracks = uniqueTracks.sort(() => Math.random() - 0.5).slice(0, limit);

  const playlistImage = shuffledTracks.length > 0 
    ? shuffledTracks[0].artworkUrl100.replace('100x100', '600x600')
    : '';

  return {
    playlistName,
    playlistImage,
    tracks: shuffledTracks,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data, error: authError } = await supabaseClient.auth.getClaims(jwt);
    
    if (authError || !data?.claims) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Authenticated user:", data.claims.sub);

    const { action, query, genre, searchTerms, playlistName, limit } = await req.json();
    
    console.log(`[Apple Music] Action: ${action}`);

    let result;

    switch (action) {
      case 'search':
        if (!query) throw new Error('Query parameter required for search');
        result = { tracks: await searchTracks(query, limit || 50) };
        break;

      case 'genre':
        if (!genre) throw new Error('Genre parameter required');
        result = { tracks: await getTracksByGenre(genre, limit || 50) };
        break;

      case 'playlist':
        if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
          throw new Error('searchTerms array parameter required for playlist action');
        }
        result = await getPlaylistTracks(searchTerms, playlistName || 'Playlist', limit || 50);
        break;

      case 'test':
        const testTracks = await searchTracks('afrobeats', 5);
        result = {
          success: true,
          message: 'Apple Music/iTunes API is working',
          sampleTracks: testTracks.map(t => ({
            name: t.trackName,
            artist: t.artistName,
            hasPreview: !!t.previewUrl,
            previewUrl: t.previewUrl,
          })),
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Apple Music] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
