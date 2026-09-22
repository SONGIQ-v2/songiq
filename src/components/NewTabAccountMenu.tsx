import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Medal, Menu, Shield, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { saveUsername } from "@/lib/challenges";

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
 * so it doesn't risk the room's state. Inside it, only actions that
 * actually navigate away (viewing the leaderboard) open in a new tab.
 * Nickname editing is a quick in-place edit, not a navigation, so it opens
 * a same-tab Dialog instead, same as "Sign out," which also still happens
 * immediately in place.
 *
 * Self-contained (pulls playerId/playerName/avatarIndex from useGameStore
 * itself, same as Header.tsx does) -- drop in anywhere, no props needed.
 * Nickname editing is the one exception: pass `roomId` so a rename can also
 * update this room's `room_players` row (so other players in the room see
 * it), same as the room-scoped rename this replaced used to do.
 */
export function NewTabAccountMenu({ roomId }: { roomId?: string } = {}) {
  const { playerId, playerName, avatarIndex, setPlayer } = useGameStore();
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [signedInUser, setSignedInUser] = useState<{ id: string; name: string } | null>(null);
  const [anonPoints, setAnonPoints] = useState<number | null>(null);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [savesAvailable, setSavesAvailable] = useState<number | null>(null);
  const [nextSaveExpires, setNextSaveExpires] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState("");

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

  const openEditName = () => {
    setEditName(playerName || signedInUser?.name || "");
    setShowProfileModal(true);
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 20);
    if (trimmed.length < 1) {
      toast.error("Name must be at least 1 character");
      return;
    }
    if (signedInUser) {
      const { error } = await (supabase as any).rpc("set_nickname", { p_name: trimmed });
      if (error) {
        toast.error("Couldn't update name", { description: error.message });
        return;
      }
    }
    if (roomId && playerId) {
      await supabase.from("room_players").update({ player_name: trimmed }).eq("room_id", roomId).eq("player_id", playerId);
    }
    setPlayer(trimmed, avatarIndex);
    saveUsername(trimmed);
    localStorage.setItem("songiq_player_name", trimmed);
    setShowProfileModal(false);
    toast.success(`You're now "${trimmed}"`);
  };

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
            <DropdownMenuItem onClick={openEditName} className="cursor-pointer">
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
            aria-label="Edit nickname"
            onClick={openEditName}
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

      {/* Nickname editing happens in place -- unlike navigations elsewhere
          in this menu, it's a quick edit the player wants to make without
          losing their spot in the room, not a page they're leaving to. */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Change your display name</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Your nickname"
              maxLength={20}
              className="text-center text-lg"
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              autoFocus
            />
            <Button
              variant="gold"
              size="lg"
              className="w-full"
              onClick={handleSaveName}
              disabled={!editName.trim()}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
