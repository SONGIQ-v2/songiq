import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  // Use genre-specific search terms to get relevant tracks
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

  // Search using multiple terms to get variety
  for (const term of searchTerms.slice(0, 3)) {
    const tracks = await searchTracks(term, Math.ceil(limit / 3));
    allTracks.push(...tracks);
  }

  // Remove duplicates by trackId
  const uniqueTracks = allTracks.filter((track, index, self) =>
    index === self.findIndex(t => t.trackId === track.trackId)
  );

  console.log(`[Apple Music] Genre "${genre}": ${uniqueTracks.length} unique tracks with previews`);
  
  return uniqueTracks.slice(0, limit);
}

// Get curated playlist-like results based on playlist name/theme
async function getPlaylistTracks(playlistQuery: string, limit: number = 50): Promise<{
  playlistName: string;
  playlistImage: string;
  tracks: iTunesTrack[];
}> {
  console.log(`[Apple Music] Fetching playlist-like tracks for: ${playlistQuery}`);
  
  const tracks = await searchTracks(playlistQuery, limit);
  
  // Use the first track's artwork as playlist image, or a default
  const playlistImage = tracks.length > 0 
    ? tracks[0].artworkUrl100.replace('100x100', '600x600')
    : '';

  return {
    playlistName: playlistQuery,
    playlistImage,
    tracks,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, genre, playlistQuery, limit } = await req.json();
    
    console.log(`[Apple Music] Action: ${action}`);

    let result;

    switch (action) {
      case 'search':
        if (!query) {
          throw new Error('Query parameter required for search');
        }
        result = { tracks: await searchTracks(query, limit || 50) };
        break;

      case 'genre':
        if (!genre) {
          throw new Error('Genre parameter required');
        }
        result = { tracks: await getTracksByGenre(genre, limit || 50) };
        break;

      case 'playlist':
        if (!playlistQuery) {
          throw new Error('PlaylistQuery parameter required');
        }
        result = await getPlaylistTracks(playlistQuery, limit || 50);
        break;

      case 'test':
        // Test the API with a simple search
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
