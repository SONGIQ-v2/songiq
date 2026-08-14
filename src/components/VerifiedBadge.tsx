import { useEffect, useId, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// A center circle plus 8 evenly-spaced "petal" circles, all the same fill --
// overlapping same-color shapes render as one seamless scalloped blob (no
// boolean-union path math needed), giving the notched seal outline
// Twitter/X's badge has instead of a plain circle. The previous numbers
// made the petals so large relative to their spacing that the union was
// indistinguishable from a plain circle -- the "valley" between adjacent
// petals was under a pixel deep at this render size. These give a valley
// depth of roughly 20% of the tip radius (worked out from where two
// adjacent petal circles cross along their shared bisector), which
// actually reads as scalloped rather than round.
const PETAL_ANGLES_DEG = [0, 45, 90, 135, 180, 225, 270, 315];
const PETAL_DISTANCE = 6.5;
const PETAL_RADIUS = 2.8;
const CENTER_RADIUS = 5;

/**
 * Shown next to a player's name wherever one is listed, for accounts that
 * are actually signed in (not anonymous) -- a gentle, ambient nudge
 * encouraging other players to sign in too. Styled like Twitter/X's
 * verified badge: a scalloped blue seal with a white checkmark, rather
 * than a plain circle or a single-tone outline icon.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  const gradientId = `verified-badge-fill-${useId()}`;
  // Tooltips are hover-only by default -- there's no hover state on
  // mobile, so tapping the badge did nothing. Controlling `open` lets a
  // tap toggle it too; it self-dismisses after a few seconds so it
  // doesn't get stuck open with no "mouse leave" to close it.
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpen(false), 2500);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label="Signed in and verified"
            onClick={handleTap}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className={cn("inline-block w-[18px] h-[18px] shrink-0 align-[-3px] cursor-help", className)}
          >
            <svg viewBox="0 0 24 24" className="w-full h-full">
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7DD3FC" />
                  <stop offset="100%" stopColor="#0284C7" />
                </linearGradient>
              </defs>
              <circle cx="12" cy="12" r={CENTER_RADIUS} fill={`url(#${gradientId})`} />
              {PETAL_ANGLES_DEG.map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const cx = 12 + PETAL_DISTANCE * Math.cos(rad);
                const cy = 12 + PETAL_DISTANCE * Math.sin(rad);
                return <circle key={deg} cx={cx} cy={cy} r={PETAL_RADIUS} fill={`url(#${gradientId})`} />;
              })}
              <path
                d="M8.5 12.2l2.3 2.3 4.7-5.4"
                fill="none"
                stroke="white"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>This player is signed in with Google and verified</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
