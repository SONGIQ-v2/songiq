import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Medal, Menu, Shield, UserCircle } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/gameStore";
import { fetchStreakProtectionStatus } from "@/lib/daily";

const NAV_LINKS = [
  { to: "/solo", label: "Solo" },
  { to: "/multiplayer", label: "Multiplayer" },
  { to: "/daily", label: "Daily Challenge" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/how-it-works", label: "How it works" },
];

/**
 * Header.tsx's "right side actions" -- the mobile nav trigger plus the
 * profile-icon/sign-in section -- adapted for screens that hold live room
 * state (Multiplayer lobby, results) where an in-page Dialog takeover or
 * same-tab navigation would be disruptive.
 *
 * The signed-in account CHIP itself opens a normal in-page dropdown, same
 * as the real site -- that's just a lightweight popover, not a navigation,
 * so it doesn't risk the room's state. Only the actions *inside* it that
 * would actually navigate (editing your nickname, viewing the leaderboard)
 * open in a new tab; "Sign out" still happens immediately in place, same
 * as everywhere else on the site.
 *
 * Self-contained (pulls playerId/playerName/avatarIndex from useGameStore
 * itself, same as Header.tsx does) -- drop in anywhere, no props needed.
 */
export function NewTabAccountMenu() {
  const { playerId, playerName, avatarIndex } = useGameStore();
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [signedInUser, setSignedInUser] = useState<{ id: string; name: string } | null>(null);
  const [anonPoints, setAnonPoints] = useState<number | null>(null);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [savesAvailable, setSavesAvailable] = useState<number | null>(null);
  const [nextSaveExpires, setNextSaveExpires] = useState<string | null>(null);

  useEffect(() => {
    const applySession = (user: { id: string; is_anonymous?: boolean; user_metadata?: Record<string, unknown> } | null) => {
      const anonymous = user?.is_anonymous ?? true;
      setIsAnonymous(anonymous);
      if (user && !anonymous) {
        const googleName = (user.user_metadata?.full_name ?? user.user_metadata?.name) as string | undefined;
        setSignedInUser({ id: user.id, name: googleName || "Player" });
      } else {
        setSignedInUser(null);
        setTotalPoints(null);
      }
    };
    supabase.auth.getSession().then(({ data }) => applySession(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => applySession(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAnonymous || !playerId) {
      setAnonPoints(null);
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("player_points")
        .select("points")
        .eq("player_id", playerId)
        .maybeSingle();
      setAnonPoints(Number(data?.points ?? 0));
    })();
  }, [isAnonymous, playerId]);

  useEffect(() => {
    if (!signedInUser) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("player_points")
        .select("points")
        .eq("player_id", signedInUser.id)
        .maybeSingle();
      setTotalPoints(Number(data?.points ?? 0));
    })();
  }, [signedInUser?.id]);

  useEffect(() => {
    if (!signedInUser) {
      setSavesAvailable(null);
      setNextSaveExpires(null);
      return;
    }
    fetchStreakProtectionStatus().then((status) => {
      setSavesAvailable(status?.saves_available ?? 0);
      setNextSaveExpires(status?.next_save_expires ?? null);
    });
  }, [signedInUser?.id]);

  const openInNewTab = (path: string) => window.open(path, "_blank", "noopener,noreferrer");

  return (
    <>
      {/* Nav -- mobile only, same links/new-tab behavior as NewTabNavMenu's
          desktop row, just collapsed into a menu here to match where
          Header.tsx nests its own mobile nav trigger (alongside the account
          section, not the desktop <nav>). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu" className="text-foreground/70 hover:text-foreground">
            <Menu className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="md:hidden">
          {NAV_LINKS.map((link) => (
            <DropdownMenuItem key={link.to} asChild>
              <Link to={link.to} target="_blank" rel="noopener noreferrer" className="text-xs font-bold uppercase tracking-[0.2em] cursor-pointer">
                {link.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {signedInUser ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Open account menu"
              className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-card/70 border border-border hover:border-primary/50 transition-colors"
            >
              <PlayerAvatar
                variant="icon-only"
                size="xs"
                name={playerName || signedInUser.name}
                avatarIndex={avatarIndex}
                playerId={signedInUser.id}
              />
              <span className="hidden sm:inline text-sm font-bold text-foreground max-w-[110px] truncate">
                {playerName || signedInUser.name}
              </span>
              {totalPoints !== null && (
                <span className="flex items-center gap-1 text-sm font-bold text-gold">
                  <Medal className="w-4 h-4" />
                  {totalPoints.toLocaleString()}
                </span>
              )}
              {savesAvailable !== null && savesAvailable > 0 && (
                <span className="hidden sm:flex items-center gap-1 text-sm font-bold text-primary">
                  <Shield className="w-4 h-4" />
                  {savesAvailable}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {savesAvailable !== null && (
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                Streak Saves: {savesAvailable}/2
                {savesAvailable > 0 && nextSaveExpires && (
                  <span> — next expires {new Date(nextSaveExpires).toLocaleDateString()}</span>
                )}
              </DropdownMenuLabel>
            )}
            <DropdownMenuItem onClick={() => openInNewTab("/?openAccount=profile")} className="cursor-pointer">
              Update nickname
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openInNewTab("/leaderboard")} className="cursor-pointer">
              My leaderboard spot
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                await supabase.auth.signOut();
              }}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <>
          <button
            aria-label="Edit nickname (opens in a new tab)"
            onClick={() => openInNewTab("/?openAccount=profile")}
            className="text-foreground/70 hover:text-foreground"
          >
            <UserCircle className="w-5 h-5" />
          </button>
          <Button
            variant="gold"
            size="sm"
            className="ml-1 rounded-full gap-2 pl-1.5"
            onClick={() => openInNewTab("/?openAccount=signin")}
          >
            {anonPoints !== null && anonPoints > 0 && (
              <span className="points-breathe inline-flex items-center px-2.5 py-1 rounded-full bg-background/90 text-gold text-[16px] font-bold tabular-nums normal-case tracking-normal">
                {anonPoints.toLocaleString()} pts
              </span>
            )}
            {anonPoints !== null && anonPoints > 0 ? "Save my points" : "Sign in"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </>
      )}
    </>
  );
}
