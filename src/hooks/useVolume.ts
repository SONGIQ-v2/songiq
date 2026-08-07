import { useEffect, useState } from "react";

const VOLUME_KEY = "songiq_volume";
const DEFAULT_VOLUME = 0.7;

function readStoredVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const stored = Number(window.localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_VOLUME;
}

/** Player's volume preference (0-1), persisted across games/sessions. */
export function useVolume() {
  const [volume, setVolume] = useState(readStoredVolume);

  useEffect(() => {
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  return [volume, setVolume] as const;
}
