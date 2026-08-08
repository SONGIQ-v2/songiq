import { useEffect, useState } from "react";

const VOLUME_KEY = "songiq_volume";
const DEFAULT_VOLUME = 1;

function readStoredVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  // Missing key must fall to the default -- Number(null) is 0, which passed
  // the range check below and silently muted every new player. A stored "0"
  // is treated the same way: that bug persisted 0 for everyone it touched,
  // so honoring it would keep them muted forever (re-muting is one tap away
  // for anyone who genuinely wants silence).
  if (raw === null) return DEFAULT_VOLUME;
  const stored = Number(raw);
  return Number.isFinite(stored) && stored > 0 && stored <= 1 ? stored : DEFAULT_VOLUME;
}

/** Player's volume preference (0-1), persisted across games/sessions. */
export function useVolume() {
  const [volume, setVolume] = useState(readStoredVolume);

  useEffect(() => {
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  return [volume, setVolume] as const;
}
