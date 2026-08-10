import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AppleMusicTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl: string;
  trackTimeMillis: number;
  primaryGenreName: string;
}

export interface PlaylistResult {
  playlistName: string;
  playlistImage: string;
  tracks: AppleMusicTrack[];
}

interface UseAppleMusicReturn {
  tracks: AppleMusicTrack[];
  loading: boolean;
  error: string | null;
  searchTracks: (query: string, limit?: number) => Promise<AppleMusicTrack[]>;
  getTracksByGenre: (genre: string, limit?: number) => Promise<AppleMusicTrack[]>;
  getPlaylistTracks: (searchTerms: string[], playlistName: string, limit?: number, isArtist?: boolean) => Promise<PlaylistResult | null>;
  testConnection: () => Promise<boolean>;
}

export function useAppleMusic(): UseAppleMusicReturn {
  const [tracks, setTracks] = useState<AppleMusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTracks = useCallback(async (query: string, limit: number = 50): Promise<AppleMusicTrack[]> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke("apple-music", {
        body: { action: "search", query, limit },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setTracks(data.tracks);
      return data.tracks;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to search tracks";
      setError(message);
      console.error("Apple Music search error:", e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getTracksByGenre = useCallback(async (genre: string, limit: number = 50): Promise<AppleMusicTrack[]> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke("apple-music", {
        body: { action: "genre", genre, limit },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setTracks(data.tracks);
      return data.tracks;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch tracks by genre";
      setError(message);
      console.error("Apple Music genre fetch error:", e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getPlaylistTracks = useCallback(async (
    searchTerms: string[],
    playlistName: string,
    limit: number = 50,
    isArtist: boolean = false
  ): Promise<PlaylistResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("apple-music", {
        body: { action: "playlist", searchTerms, playlistName, limit, isArtist },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setTracks(data.tracks);
      return {
        playlistName: data.playlistName,
        playlistImage: data.playlistImage,
        tracks: data.tracks,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch playlist";
      setError(message);
      console.error("Apple Music playlist fetch error:", e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const testConnection = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke("apple-music", {
        body: { action: "test" },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      console.log("Apple Music test result:", data);
      return data.success;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to test connection";
      setError(message);
      console.error("Apple Music test error:", e);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    tracks,
    loading,
    error,
    searchTracks,
    getTracksByGenre,
    getPlaylistTracks,
    testConnection,
  };
}
