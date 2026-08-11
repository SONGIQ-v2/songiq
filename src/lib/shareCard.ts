// Post-game share card: builds a Wordle-style shareable result and hands it
// to the native share sheet (mobile) or the clipboard (desktop).

const SHARE_URL = "https://songiq.io";

export interface ShareCardOptions {
  categoryName: string;
  score: number;
  /** Per-round correctness, in round order */
  results: boolean[];
  /** Multiplayer only */
  rank?: number;
  playerCount?: number;
  /** Link that replays the exact same songs (challenge mode) */
  challengeUrl?: string;
}

export function buildShareText({ categoryName, score, results, rank, playerCount, challengeUrl }: ShareCardOptions): string {
  const grid = results.map((r) => (r ? "🟩" : "🟥")).join("");
  const correct = results.filter(Boolean).length;

  const lines = [
    `🎵 SongIQ — ${categoryName}`,
    `${grid} ${correct}/${results.length} · ${score} pts`,
  ];

  if (rank && playerCount && playerCount > 1) {
    const medal = rank === 1 ? "🏆" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🎧";
    lines.push(`${medal} #${rank} of ${playerCount} players`);
  }

  lines.push(
    "",
    challengeUrl
      ? `Same songs — beat my score 👉 ${challengeUrl}`
      : `Think you know music? Beat me 👉 ${SHARE_URL}`
  );
  return lines.join("\n");
}

/**
 * For sharing an attempt after revisiting it later -- only the aggregate
 * score/correct_count survive in the database (challenge_attempts has no
 * per-round column), so unlike buildShareText() this can't reproduce the
 * exact 🟩🟥 grid from the original result, only the totals.
 */
export function buildChallengeResultShareText(opts: {
  categoryName: string;
  score: number;
  correctCount: number;
  totalRounds: number;
  challengeUrl?: string;
}): string {
  const lines = [
    `🎵 SongIQ — ${opts.categoryName}`,
    `${opts.correctCount}/${opts.totalRounds} correct · ${opts.score} pts`,
    "",
    opts.challengeUrl
      ? `Same songs — beat my score 👉 ${opts.challengeUrl}`
      : `Think you know music? Beat me 👉 ${SHARE_URL}`,
  ];
  return lines.join("\n");
}

export type ShareOutcome = "shared" | "copied" | "canceled" | "failed";

/**
 * Native share sheets are only a good experience on phones/tablets. Desktop
 * browsers also implement navigator.share (Windows/macOS share panels), but
 * they're flaky — half-succeeding, rejecting after sharing, and consuming
 * the user gesture so clipboard writes fail. On desktop we always use
 * download + copy instead.
 */
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  if (/android|iphone|ipod/i.test(ua)) return true;
  // iPads (including iPadOS masquerading as macOS)
  if (/ipad/i.test(ua)) return true;
  if (/mac/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

/** Legacy copy fallback for when the async Clipboard API rejects
 * (stale user gesture, unfocused document, older browsers). */
export function legacyCopyText(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopyText(text);
  }
}

export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && navigator.share && isMobileDevice()) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "canceled"; // user closed the sheet
      // fall through to clipboard
    }
  }
  return (await copyText(text)) ? "copied" : "failed";
}
