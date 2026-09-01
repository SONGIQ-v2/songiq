import { Link, useLocation } from "react-router-dom";
import songiqLogo from "@/assets/songiq-logo.png";
import { Medal, Menu, UserCircle } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useGameStore } from "@/lib/gameStore";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBar } from "@/components/NotificationBar";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

const NAV_LINKS = [
  { to: "/solo", label: "Solo" },
  { to: "/multiplayer", label: "Multiplayer" },
  { to: "/daily", label: "Daily Challenge" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/how-it-works", label: "How it works" },
];

export const Header = () => {
  const location = useLocation();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const { playerName, setPlayer, avatarIndex, openSignInModal } = useGameStore();
  const [editName, setEditName] = useState("");
  // Signed-in players (Google-linked, once Lovable enables the provider)
  // get a profile chip instead of the Sign in button + account icon
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [signedInUser, setSignedInUser] = useState<{ id: string; name: string } | null>(null);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const fixedWrapperRef = useRef<HTMLDivElement>(null);

  // Publishes the fixed header's real, current on-screen height (bar
  // included whenever it's showing) as a CSS variable, so every page can
  // read it instead of guessing a fixed pixel offset -- handles the bar
  // appearing/disappearing and mobile/desktop nav wrapping automatically.
  useLayoutEffect(() => {
    const el = fixedWrapperRef.current;
    if (!el) return;
    const setHeightVar = () => {
      document.documentElement.style.setProperty("--header-height", `${el.offsetHeight}px`);
    };
    setHeightVar();
    const observer = new ResizeObserver(setHeightVar);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Load saved name from localStorage
    const saved = localStorage.getItem("songiq_player_name");
    if (saved && !playerName) {
      setPlayer(saved, avatarIndex);
    }
  }, []);

  useEffect(() => {
    // Nickname adoption/sync for signed-in accounts now happens centrally
    // in gameStore.ts's own auth listener (it needs to run regardless of
    // which page is mounted -- e.g. Daily.tsx renders no Header at all).
    // This effect only tracks local UI bookkeeping: the profile chip vs.
    // "Sign in" button, and the Points total below.
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

  // Total Points for the signed-in chip
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
  }, [signedInUser?.id, location.pathname]);

  const handleSaveName = async () => {
    const trimmed = editName.trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 20);
    if (trimmed.length < 1) {
      toast({ title: "Name must be at least 1 character", variant: "destructive" });
      return;
    }
    // Signed-in accounts: the DB is authoritative now, so persist there
    // first -- local state only updates once the rename actually succeeds.
    if (!isAnonymous) {
      const { error } = await (supabase as any).rpc("set_nickname", { p_name: trimmed });
      if (error) {
        toast({ title: "Couldn't update name", description: error.message, variant: "destructive" });
        return;
      }
    }
    setPlayer(trimmed, avatarIndex);
    localStorage.setItem("songiq_player_name", trimmed);
    setShowProfileModal(false);
    toast({ title: "Name updated!", description: `You're now "${trimmed}"` });
  };

  return (
    <>
      <div ref={fixedWrapperRef} className="fixed top-0 left-0 right-0 z-50">
        <NotificationBar isAnonymous={isAnonymous} />
        <header className="px-4 py-3 bg-background/60 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo - left aligned */}
          <Link to="/" className="flex items-center" aria-label="SongIQ home">
            <img src={songiqLogo} alt="SongIQ — Music Trivia Game" width="160" height="40" fetchPriority="high" decoding="async" className="h-8 md:h-10 w-auto" />
          </Link>

          {/* Nav - desktop */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`text-xs font-bold uppercase tracking-[0.2em] transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-1">
            {/* Nav - mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className="text-foreground/70 hover:text-foreground"
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="md:hidden">
                {NAV_LINKS.map((link) => (
                  <DropdownMenuItem key={link.to} asChild>
                    <Link
                      to={link.to}
                      className="text-xs font-bold uppercase tracking-[0.2em] cursor-pointer"
                    >
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
                    <span className="text-sm font-bold text-foreground max-w-[110px] truncate">
                      {playerName || signedInUser.name}
                    </span>
                    {totalPoints !== null && (
                      <span className="flex items-center gap-1 text-sm font-bold text-gold">
                        <Medal className="w-4 h-4" />
                        {totalPoints.toLocaleString()}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditName(playerName || localStorage.getItem("songiq_player_name") || "");
                      setShowProfileModal(true);
                    }}
                    className="cursor-pointer"
                  >
                    Update nickname
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/leaderboard" className="cursor-pointer">
                      My leaderboard spot
                    </Link>
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
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open profile and edit nickname"
                  onClick={() => {
                    setEditName(playerName || localStorage.getItem("songiq_player_name") || "");
                    setShowProfileModal(true);
                  }}
                  className="text-foreground/70 hover:text-foreground"
                >
                  <UserCircle className="w-5 h-5" />
                </Button>
                <Button variant="outline" size="sm" onClick={openSignInModal} className="ml-1">
                  Sign in
                </Button>
              </>
            )}
          </div>
        </div>
        </header>
      </div>

      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Your Name</DialogTitle>
            <DialogDescription>
              Choose a nickname that other players will see
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              placeholder="Enter your name"
              aria-label="Your nickname"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={20}
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowProfileModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveName}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
