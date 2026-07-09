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
 * timeout fallback). Returns the prepared HTMLAudioElement.
 */
export function preloadAudio(
  url: string,
  { timeoutMs = 2500, volume = 0.7 }: { timeoutMs?: number; volume?: number } = {}
): { audio: HTMLAudioElement; ready: Promise<void> } {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = volume;
  audio.src = url;

  const ready = new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    audio.addEventListener("canplaythrough", finish, { once: true });
    audio.addEventListener("canplay", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    setTimeout(finish, timeoutMs);
    try {
      audio.load();
    } catch {
      finish();
    }
  });

  return { audio, ready };
}

/**
 * Fully download an audio file and return an object URL for instant playback.
 * Returns null on failure — callers fall back to streaming from the network.
 */
export async function fetchAudioObjectUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
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
