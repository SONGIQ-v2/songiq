import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SpotifyToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; height: number; width: number }[];
  };
  preview_url: string | null;
  duration_ms: number;
}

// Get Spotify access token using client credentials flow
async function getSpotifyToken(): Promise<string> {
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Spotify auth error:", error);
    throw new Error("Failed to authenticate with Spotify");
  }

  const data: SpotifyToken = await response.json();
  return data.access_token;
}

// Fetch tracks from a playlist
async function getPlaylistTracks(token: string, playlistId: string): Promise<SpotifyTrack[]> {
  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,artists(name),album(name,images),preview_url,duration_ms))`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Spotify playlist error:", error);
    throw new Error("Failed to fetch playlist");
  }

  const data = await response.json();
  return data.items
    .map((item: { track: SpotifyTrack }) => item.track)
    .filter((track: SpotifyTrack) => track && track.preview_url); // Only tracks with preview URLs
}

// Search for tracks
async function searchTracks(token: string, query: string, market: string = "NG"): Promise<SpotifyTrack[]> {
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&market=${market}&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Spotify search error:", error);
    throw new Error("Failed to search tracks");
  }

  const data = await response.json();
  return data.tracks.items.filter((track: SpotifyTrack) => track.preview_url);
}

// Get tracks by category with fallback search queries
async function getTracksByCategory(token: string, category: string): Promise<SpotifyTrack[]> {
  const categorySearches: Record<string, string[]> = {
    afrobeats: ["afrobeats 2024", "wizkid", "burna boy", "davido", "rema", "tems"],
    amapiano: ["amapiano 2024", "kabza de small", "DJ maphorisa", "uncle waffles"],
    highlife: ["highlife music", "kk fosu", "daddy lumba", "kofi kinaata"],
    bongoFlava: ["bongo flava", "diamond platnumz", "harmonize", "rayvanny"],
    naija: ["naija hits 2024", "nigerian music", "afrobeats nigeria"],
    genge: ["gengetone", "kenyan music", "sauti sol", "nyashinski"],
    afroClassics: ["fela kuti", "king sunny ade", "miriam makeba", "youssou ndour"],
    hiplife: ["hiplife ghana", "sarkodie", "shatta wale", "stonebwoy"],
  };

  const searches = categorySearches[category] || categorySearches.afrobeats;
  let allTracks: SpotifyTrack[] = [];

  // Search using multiple queries to get variety
  for (const query of searches.slice(0, 3)) {
    try {
      const tracks = await searchTracks(token, query);
      allTracks = [...allTracks, ...tracks];
    } catch (e) {
      console.error(`Search failed for ${query}:`, e);
    }
  }

  // Remove duplicates by track ID
  const uniqueTracks = Array.from(
    new Map(allTracks.map((track) => [track.id, track])).values()
  );

  // Shuffle and return
  return uniqueTracks.sort(() => Math.random() - 0.5);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, category, playlistId, query } = await req.json();
    const token = await getSpotifyToken();

    let tracks: SpotifyTrack[] = [];

    switch (action) {
      case "playlist":
        if (!playlistId) throw new Error("Playlist ID required");
        tracks = await getPlaylistTracks(token, playlistId);
        break;

      case "category":
        if (!category) throw new Error("Category required");
        tracks = await getTracksByCategory(token, category);
        break;

      case "search":
        if (!query) throw new Error("Search query required");
        tracks = await searchTracks(token, query);
        break;

      default:
        throw new Error("Invalid action");
    }

    return new Response(JSON.stringify({ tracks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Spotify function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
