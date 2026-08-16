/**
 * Kahoot-style one-liner after a multiplayer round ends.
 * Pure client logic from reveal-time state — no network.
 */

export type CeremonyPlayer = {
  player_id: string;
  player_name: string;
  score: number;
  roundScore?: number;
  previousRank?: number;
  currentRank?: number;
  hasAnswered?: boolean;
};

export type RoundCeremony = {
  text: string;
  /** Visual tone for the UI accent */
  tone: "hype" | "roast" | "neutral";
};

const normalize = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function correctPlayerIds(
  players: CeremonyPlayer[],
  roundAnswers: Record<string, string[]>,
  correctAnswer: string | null | undefined
): Set<string> {
  const ids = new Set<string>();

  // Points > 0 ⇒ graded correct (wrong / timeout are 0)
  for (const p of players) {
    if ((p.roundScore ?? 0) > 0) ids.add(p.player_id);
  }

  const key = normalize(correctAnswer);
  if (key) {
    for (const [option, pickers] of Object.entries(roundAnswers)) {
      if (normalize(option) === key) {
        for (const id of pickers) ids.add(id);
      }
    }
  }

  return ids;
}

/**
 * Returns a short ceremony line for the just-finished round, or null when
 * there isn't enough signal yet (reveal data still landing).
 */
export function getRoundCeremony(args: {
  players: CeremonyPlayer[];
  roundAnswers: Record<string, string[]>;
  correctAnswer: string | null | undefined;
}): RoundCeremony | null {
  const { players, roundAnswers, correctAnswer } = args;
  if (players.length < 2) return null;

  const correctIds = correctPlayerIds(players, roundAnswers, correctAnswer);
  const answeredCount = players.filter((p) => p.hasAnswered).length;
  const hasPickData = Object.keys(roundAnswers).length > 0;
  const hasScoreData = players.some((p) => (p.roundScore ?? 0) > 0);

  // Avoid roasting "nobody got it" before reveal rows have arrived
  const revealReady =
    hasScoreData ||
    hasPickData ||
    (answeredCount >= players.length && Boolean(normalize(correctAnswer)));

  if (!revealReady) return null;

  const correctPlayers = players.filter((p) => correctIds.has(p.player_id));
  const correctCount = correctPlayers.length;

  // Priority: most specific / dramatic first
  if (correctCount === players.length) {
    return { text: "Clean sweep", tone: "hype" };
  }

  if (correctCount === 1) {
    const name = correctPlayers[0].player_name?.trim() || "Someone";
    return { text: `Only ${name} got it`, tone: "hype" };
  }

  if (correctCount === 0) {
    return { text: "Nobody got it", tone: "roast" };
  }

  const byScore = [...players].sort((a, b) => b.score - a.score);
  const leader = byScore[0];
  const second = byScore[1];

  // New #1 this round (wasn't leading when the round started / last rank snapshot)
  if (leader && leader.previousRank != null && leader.previousRank > 1) {
    const name = leader.player_name?.trim() || "Someone";
    return { text: `${name} takes the lead`, tone: "hype" };
  }

  if (leader && second && leader.score - second.score <= 50) {
    return { text: "Photo finish", tone: "neutral" };
  }

  return {
    text: `${correctCount} of ${players.length} got it`,
    tone: "neutral",
  };
}
