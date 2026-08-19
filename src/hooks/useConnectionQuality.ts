import { useState, useEffect, useRef } from "react";

export type ConnectionQuality = "good" | "fair" | "poor" | "unknown";

const PING_INTERVAL_MS = 8000;
const GOOD_THRESHOLD_MS = 200;
const FAIR_THRESHOLD_MS = 500;

/**
 * Periodically pings a lightweight endpoint and reports connection quality.
 * Uses a tiny ranged request to the Apple CDN (same origin the game's
 * preview clips come from) so the measurement reflects the path that
 * actually matters for gameplay audio.
 *
 * Falls back to a Supabase health endpoint when no probe URL is available.
 */
export function useConnectionQuality(
  enabled: boolean,
  probeUrl?: string | null
): ConnectionQuality {
  const [quality, setQuality] = useState<ConnectionQuality>("unknown");
  const lastThreeRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) {
      setQuality("unknown");
      lastThreeRef.current = [];
      return;
    }

    const measure = async () => {
      const url = probeUrl || "https://audio-ssl.itunes.apple.com";
      const start = performance.now();
      try {
        await fetch(url, {
          method: "HEAD",
          mode: "no-cors",
          cache: "no-store",
        });
        const rtt = performance.now() - start;

        const window = lastThreeRef.current;
        window.push(rtt);
        if (window.length > 3) window.shift();
        const avg = window.reduce((a, b) => a + b, 0) / window.length;

        if (avg < GOOD_THRESHOLD_MS) setQuality("good");
        else if (avg < FAIR_THRESHOLD_MS) setQuality("fair");
        else setQuality("poor");
      } catch {
        setQuality("poor");
      }
    };

    measure();
    const id = setInterval(measure, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, probeUrl]);

  return quality;
}
