import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { searchTracks, fetchPlaylistPool, type iTunesTrack } from "../_shared/itunes.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // refresh a playlist's pool daily

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

// Serve a playlist from the cache, refreshing from iTunes when stale.
async function getPlaylistTracksCached(
  searchTerms: string[],
  playlistName: string,
  limit: number
): Promise<{ playlistName: string; playlistImage: string; tracks: iTunesTrack[] }> {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: cached } = await admin
    .from('playlist_cache')
    .select('tracks, image_url, updated_at')
    .eq('playlist_name', playlistName)
    .maybeSingle();

  const isFresh = cached &&
    Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS;

  let pool: iTunesTrack[];
  let image: string;

  if (cached && isFresh && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
    pool = cached.tracks as iTunesTrack[];
    image = cached.image_url;
    console.log(`[Apple Music] Cache hit for "${playlistName}" (${pool.length} tracks)`);
  } else {
    try {
      const fetched = await fetchPlaylistPool(searchTerms, 50);
      if (fetched.pool.length === 0) throw new Error('iTunes returned no tracks');
      pool = fetched.pool;
      image = fetched.image;
      await admin.from('playlist_cache').upsert({
        playlist_name: playlistName,
        search_terms: searchTerms,
        tracks: pool,
        image_url: image,
        updated_at: new Date().toISOString(),
      });
      console.log(`[Apple Music] Cache refreshed for "${playlistName}" (${pool.length} tracks)`);
    } catch (e) {
      // iTunes trouble: serve the stale pool rather than failing the game
      if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
        console.error(`[Apple Music] Refresh failed for "${playlistName}", serving stale cache:`, e);
        pool = cached.tracks as iTunesTrack[];
        image = cached.image_url;
      } else {
        throw e;
      }
    }
  }

  // Shuffle server-side so each game draws a different hand from the pool
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, limit);

  return { playlistName, playlistImage: image, tracks: shuffled };
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
        result = await getPlaylistTracksCached(searchTerms, playlistName || 'Playlist', limit || 50);
        break;

      case 'test': {
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
      }

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
