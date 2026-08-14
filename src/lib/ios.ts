// Detects iOS (iPhone/iPod/iPad, including iPadOS 13+). Used to gate the
// "Tap for sound" autoplay-unlock fallback in multiplayer -- iOS Safari's
// autoplay policy requires play() to run synchronously inside a real user
// gesture, which the automatic playWithWatchdog call from a useEffect never
// is, so unmuted audio there routinely stalls or plays with no audible
// sound there specifically.
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return true;
  if (/iPad/.test(ua)) return true;
  // iPadOS 13+ reports itself as "MacIntel" to pass as desktop Safari --
  // multi-touch is the reliable disambiguator, since no real Mac has it.
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}
