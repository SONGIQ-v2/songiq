import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SpotifyTrack, CategoryKey } from "@/lib/spotify";

interface UseSpotifyReturn {
  tracks: SpotifyTrack[];
  loading: boolean;
  error: string | null;
  fetchByCategory: (category: CategoryKey) => Promise<SpotifyTrack[]>;
  fetchByPlaylist: (playlistId: string) => Promise<SpotifyTrack[]>;
  searchTracks: (query: string) => Promise<SpotifyTrack[]>;
}

export function useSpotify(): UseSpotifyReturn {
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchByCategory = useCallback(async (category: CategoryKey): Promise<SpotifyTrack[]> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke("spotify", {
        body: { action: "category", category },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setTracks(data.tracks);
      return data.tracks;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch tracks";
      setError(message);
      console.error("Spotify fetch error:", e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchByPlaylist = useCallback(async (playlistId: string): Promise<SpotifyTrack[]> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke("spotify", {
        body: { action: "playlist", playlistId },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setTracks(data.tracks);
      return data.tracks;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch playlist";
      setError(message);
      console.error("Spotify fetch error:", e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const searchTracks = useCallback(async (query: string): Promise<SpotifyTrack[]> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke("spotify", {
        body: { action: "search", query },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setTracks(data.tracks);
      return data.tracks;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to search tracks";
      setError(message);
      console.error("Spotify search error:", e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    tracks,
    loading,
    error,
    fetchByCategory,
    fetchByPlaylist,
    searchTracks,
  };
}
