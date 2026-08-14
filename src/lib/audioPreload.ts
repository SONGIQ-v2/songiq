// Lightweight helpers to reduce audio playback latency.

const warmed = new Set<string>();

/**
 * Warm the CDN connection for an audio URL by issuing a tiny ranged request.
 * This primes DNS, TLS, and the origin's first-byte cache without downloading
 * the full file. Safe to call multiple times; results are cached per URL.
 */
export function warmAudioUrl(url: string | null | undefined) {
  if (!url || warmed.has(url)) return;
  warmed.add(url);
  try {
    fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      mode: "cors",
      cache: "force-cache",
    }).catch(() => {
      // CDN warming is best-effort; ignore failures.
    });
  } catch {
    // ignore
  }
}

/**
 * Preload an audio element and resolve when it can play through (or after a
 * timeout fallback). Returns the prepared HTMLAudioElement, plus a `ready`
 * promise that tells the caller *why* it resolved -- "ready" (canplay/
 * canplaythrough actually fired), "timeout" (still loading, budget expired,
 * probably fine to attempt playback anyway), or "error" (the element itself
 * reported an error -- worth logging distinctly rather than silently
 * treating the same as a clean ready state).
 */
export function preloadAudio(
  url: string,
  { timeoutMs = 2500, volume = 0.7 }: { timeoutMs?: number; volume?: number } = {}
): { audio: HTMLAudioElement; ready: Promise<"ready" | "timeout" | "error"> } {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = volume;
  audio.src = url;

  const ready = new Promise<"ready" | "timeout" | "error">((resolve) => {
    let done = false;
    const finish = (result: "ready" | "timeout" | "error") => {
      if (done) return;
      done = true;
      resolve(result);
    };
    audio.addEventListener("canplaythrough", () => finish("ready"), { once: true });
    audio.addEventListener("canplay", () => finish("ready"), { once: true });
    audio.addEventListener("error", () => finish("error"), { once: true });
    setTimeout(() => finish("timeout"), timeoutMs);
    try {
      audio.load();
    } catch {
      finish("error");
    }
  });

  return { audio, ready };
}

/**
 * Fully download an audio file into the browser's HTTP cache (Apple previews
 * are served with a ~1 year max-age). Playing the normal URL afterwards loads
 * instantly from disk cache — no blob URLs, which iOS refuses to play for
 * Apple's audio/x-m4p content type. Returns false on failure; playback then
 * falls back to streaming.
 */
export async function prefetchAudio(url: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url, { mode: "cors", cache: "force-cache", signal });
    if (!res.ok) return false;
    await res.arrayBuffer(); // consume fully so the cache entry is complete
    return true;
  } catch {
    return false;
  }
}

/**
 * Play an audio element with the muted-then-unmute trick to bypass autoplay
 * stalls on some mobile browsers. Restores the desired volume after play()
 * resolves.
 */
export async function playWithUnmute(
  audio: HTMLAudioElement,
  desiredVolume: number
): Promise<void> {
  const originalMuted = audio.muted;
  audio.muted = true;
  try {
    await audio.play();
  } finally {
    audio.muted = originalMuted;
    audio.volume = desiredVolume;
  }
}

/**
 * Play audio and confirm it actually starts producing sound, not just that
 * play() resolved. On a slow connection, play() can resolve while the
 * element then stalls indefinitely with no sound and no error -- this races
 * the "playing" event (fires once frames actually render) against a short
 * watchdog timeout, so a caller can tell "confirmed playing" apart from
 * "resolved but stalled" or "rejected/errored" instead of assuming success.
 *
 * A stall on the first attempt gets one silent retry -- force a fresh
 * audio.load() and try again -- before reporting failure. A brief network
 * hiccup (a dropped packet, a momentary stall) often clears on its own, and
 * the browser doesn't always recover from a wedged request by itself; a
 * fresh load usually succeeds instantly if the hiccup already passed. This
 * doesn't help a connection that's simply slow throughout -- only a
 * transient blip -- so a second stall is reported as-is.
 */
export async function playWithWatchdog(
  audio: HTMLAudioElement,
  desiredVolume: number,
  watchdogMs: number = 4000
): Promise<{ stalled: boolean; error?: unknown }> {
  const attempt = async (): Promise<{ stalled: boolean; error?: unknown }> => {
    try {
      await playWithUnmute(audio, desiredVolume);
    } catch (error) {
      return { stalled: true, error };
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = (stalled: boolean) => {
        if (done) return;
        done = true;
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("error", onError);
        resolve(stalled ? { stalled: true, error: audio.error ?? undefined } : { stalled: false });
      };
      const onPlaying = () => finish(false);
      const onError = () => finish(true);
      // "playing" may have already fired before these listeners attached
      // (fast/cached playback) -- treat "not paused" as confirmed already.
      if (!audio.paused) {
        finish(false);
        return;
      }
      audio.addEventListener("playing", onPlaying, { once: true });
      audio.addEventListener("error", onError, { once: true });
      setTimeout(() => finish(true), watchdogMs);
    });
  };

  const first = await attempt();
  if (!first.stalled) return first;

  try {
    audio.load();
  } catch {
    // ignore -- still worth trying to play again below
  }
  return attempt();
}
