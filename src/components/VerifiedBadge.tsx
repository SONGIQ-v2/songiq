import { BadgeCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Shown next to a player's name wherever one is listed, for accounts that
 * are actually signed in (not anonymous) -- a gentle, ambient nudge
 * encouraging other players to sign in too.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <BadgeCheck
            className={cn("inline-block w-3.5 h-3.5 text-sky-400 shrink-0 align-[-2px]", className)}
            aria-label="Signed in and verified"
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>This player is signed in with Google and verified</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
