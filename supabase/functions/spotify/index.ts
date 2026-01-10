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

interface PlaylistInfo {
  id: string;
  name: string;
  description: string;
  images: { url: string; height: number | null; width: number | null }[];
  tracks: SpotifyTrack[];
  allArtists: string[];
}

// Get Spotify access token using client credentials flow
async function getSpotifyToken(): Promise<string> {
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    console.error("Missing Spotify credentials - CLIENT_ID:", !!clientId, "CLIENT_SECRET:", !!clientSecret);
    throw new Error("Spotify credentials not configured");
  }

  console.log("Authenticating with Spotify...");

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
    console.error("Spotify auth error:", response.status, error);
    throw new Error("Failed to authenticate with Spotify");
  }

  const data: SpotifyToken = await response.json();
  console.log("Spotify auth successful, token expires in:", data.expires_in);
  return data.access_token;
}

// Fetch playlist metadata and tracks
async function getPlaylist(token: string, playlistId: string): Promise<PlaylistInfo> {
  console.log("Fetching playlist:", playlistId);
  
  // Get full playlist data including tracks
  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Spotify playlist error:", response.status, error);
    throw new Error(`Failed to fetch playlist: ${response.status}`);
  }

  const playlist = await response.json();
  console.log("Got playlist:", playlist.name, "with", playlist.tracks.items.length, "tracks");

  // Extract tracks
  const allTracks = playlist.tracks.items
    .map((item: { track: SpotifyTrack | null }) => item.track)
    .filter((track: SpotifyTrack | null): track is SpotifyTrack => track !== null);
  
  const tracksWithPreview = allTracks.filter((track: SpotifyTrack) => track.preview_url !== null);

  console.log(`${tracksWithPreview.length} tracks with preview URLs out of ${allTracks.length} total`);

  // Collect all unique artists from the playlist for generating wrong answers
  const allArtistsSet = new Set<string>();
  allTracks.forEach((track: SpotifyTrack) => {
    track.artists.forEach(artist => allArtistsSet.add(artist.name));
  });

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description || "",
    images: playlist.images || [],
    tracks: tracksWithPreview,
    allArtists: Array.from(allArtistsSet),
  };
}

// Search for tracks
async function searchTracks(token: string, query: string): Promise<{ tracks: SpotifyTrack[], totalFound: number, withPreview: number }> {
  console.log("Searching for tracks:", query);
  
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Spotify search error:", response.status, error);
    throw new Error("Failed to search tracks");
  }

  const data = await response.json();
  const allTracks = data.tracks.items;
  const tracksWithPreview = allTracks.filter((track: SpotifyTrack) => track.preview_url);
  
  console.log(`Search: ${tracksWithPreview.length}/${allTracks.length} tracks with preview`);
  
  // Log first few tracks for debugging
  if (allTracks.length > 0) {
    console.log("Sample track preview_url:", allTracks[0]?.preview_url);
  }
  
  return {
    tracks: tracksWithPreview,
    totalFound: allTracks.length,
    withPreview: tracksWithPreview.length
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body));
    
    const { action, playlistId, query } = body;
    const token = await getSpotifyToken();

    switch (action) {
      case "playlist": {
        if (!playlistId) throw new Error("Playlist ID required");
        const playlist = await getPlaylist(token, playlistId);
        return new Response(JSON.stringify({ playlist }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "search": {
        if (!query) throw new Error("Search query required");
        const result = await searchTracks(token, query);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "test": {
        // Test endpoint with debug info
        console.log("Running API test...");
        const searchResult = await searchTracks(token, "wizkid");
        
        // Return sample of raw track data for debugging
        const rawResponse = await fetch(
          `https://api.spotify.com/v1/search?q=wizkid&type=track&limit=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const rawData = await rawResponse.json();
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Spotify API connected",
          totalFound: searchResult.totalFound,
          tracksWithPreview: searchResult.withPreview,
          sampleTracks: rawData.tracks.items.slice(0, 3).map((t: SpotifyTrack) => ({
            name: t.name,
            artist: t.artists[0]?.name,
            preview_url: t.preview_url,
            album_image: t.album?.images?.[0]?.url
          }))
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Invalid action: ${action}`);
    }
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
