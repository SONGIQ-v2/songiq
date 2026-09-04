import { Crown } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { cn } from "@/lib/utils";
import type { DailyAttempt } from "@/lib/daily";

// Card order in the DOM is rank order (1st, 2nd, 3rd); order-* classes are
// what actually arrange them -- mobile stacks by importance (champion
// first), desktop uses the classic podium arrangement (2nd, 1st, 3rd).
const RANK_STYLES = [
  {
    label: "#1 CHAMPION",
    accent: "text-gold",
    crownClass: "text-gold",
    cardClass: "border-gold/50 md:scale-105 md:-translate-y-2",
    order: "order-1 md:order-2",
  },
  {
    label: "#2 SILVER",
    accent: "text-slate-300",
    crownClass: "text-slate-300",
    cardClass: "border-border",
    order: "order-2 md:order-1",
  },
  {
    label: "#3 BRONZE",
    accent: "text-amber-500",
    crownClass: "text-amber-600",
    cardClass: "border-border",
    order: "order-3",
  },
];

function formatSpeed(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function DailyPodium({
  attempts,
  currentPlayerId,
  verifiedIds,
  totalRounds,
}: {
  /** Top 3, already sorted by score descending. */
  attempts: DailyAttempt[];
  currentPlayerId: string | null;
  verifiedIds: Set<string>;
  totalRounds: number;
}) {
  if (attempts.length === 0) {
    return (
      <div className="raised-panel p-8 text-center text-muted-foreground text-sm">
        No one has played yet — be first!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-end">
      {attempts.map((a, i) => {
        const rank = RANK_STYLES[i];
        const isMe = a.player_id === currentPlayerId;
        const accuracy = totalRounds > 0 ? Math.round((a.correct_count / totalRounds) * 100) : 0;

        return (
          <div
            key={a.player_id}
            className={cn(
              "raised-panel p-5 pt-6 text-center border-2 relative",
              rank.cardClass,
              rank.order,
              isMe && "ring-2 ring-primary"
            )}
          >
            <span
              className={cn(
                "absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-background border border-current",
                rank.accent
              )}
            >
              {rank.label}
            </span>
            <Crown className={cn("w-7 h-7 mx-auto mb-1", rank.crownClass)} fill="currentColor" />
            <PlayerAvatar
              variant="icon-only"
              size="md"
              name={a.player_name}
              avatarIndex={1}
              playerId={a.player_id}
              className="mx-auto"
            />
            <p className="mt-2 font-bold text-foreground flex items-center justify-center gap-1 truncate">
              {a.player_name}
              {verifiedIds.has(a.player_id) && <VerifiedBadge />}
              {isMe && <span className="text-primary text-xs font-normal">(you)</span>}
            </p>
            <p className={cn("text-2xl font-bold mt-1", rank.accent)}>
              {a.score} <span className="text-xs font-normal text-muted-foreground">PTS</span>
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border/40 text-xs">
              <div>
                <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Accuracy</p>
                <p className="font-bold text-foreground">
                  {a.correct_count}/{totalRounds} ({accuracy}%)
                </p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Avg Speed</p>
                <p className="font-bold text-foreground">{formatSpeed(a.avg_response_ms)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
