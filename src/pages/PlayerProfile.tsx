import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Lock, RefreshCw, Trophy, Radio, TrendingUp, Award, Music2, CalendarDays, LinkIcon, Clock, Flame,
} from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

interface PlayerProfileData {
  playerId: string;
  playerName: string | null;
  points: number;
  gamesPlayed: number;
  soloGamesPlayed: number;
  dailyChallengesPlayed: number;
  challengesPlayed: number;
  minutesPlayed: number;
  currentStreak: number;
  bestStreak: number;
  roomsPlayed: number;
  avgPosition: number | null;
  winRatePct: number;
}

function StatTile({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof Trophy;
  label: string;
  value: number | string;
  sublabel?: string;
}) {
  return (
    <div className="text-center p-4 rounded-xl bg-card/50 border border-border/50">
      <Icon className="w-4 h-4 text-primary mx-auto mb-1.5" />
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sublabel && <p className="text-xs text-primary mt-0.5 truncate">{sublabel}</p>}
    </div>
  );
}

export default function PlayerProfile() {
  const { playerId } = useParams<{ playerId: string }>();
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [profile, setProfile] = useState<PlayerProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Requires the email-password provider, not just "not anonymous" -- same
  // admin gate as /anonymous (Admin.tsx) -- once players can link Google
  // accounts, they'd otherwise pass this check too.
  const isAdmin =
    session &&
    session !== "loading" &&
    !session.user.is_anonymous &&
    (session.user.app_metadata?.providers as string[] | undefined)?.includes("email");

  const fetchProfile = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "player_profile", playerId: id },
    });
    if (fnError) {
      setError(fnError.message ?? "Failed to load player profile");
    } else {
      setProfile(data as PlayerProfileData);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin || !playerId) return;
    fetchProfile(playerId);
  }, [isAdmin, playerId, fetchProfile]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setLoginError(signInError.message);
    setLoggingIn(false);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Player Profile — SongIQ</title>
      </Helmet>
      <Starfield />

      <main className="relative z-10 max-w-3xl mx-auto px-4 pt-16 pb-12">
        {session === "loading" ? null : !isAdmin ? (
          <div className="max-w-sm mx-auto raised-panel p-8 mt-16">
            <Lock className="w-8 h-8 text-primary mx-auto mb-4" />
            <h1 className="text-xl font-bold text-center text-foreground mb-6">Admin Login</h1>
            <form onSubmit={handleLogin} className="space-y-3">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
              <Button type="submit" variant="gold" className="w-full" disabled={loggingIn}>
                {loggingIn ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </div>
        ) : !playerId ? (
          <div className="raised-panel p-8 text-center text-muted-foreground text-sm">
            No player ID given — visit /anonymous/player/&lt;playerId&gt;.
          </div>
        ) : loading ? (
          <div className="raised-panel p-8 text-center">
            <RefreshCw className="w-6 h-6 text-primary mx-auto mb-3 animate-spin" />
            <p className="text-muted-foreground">Loading player profile...</p>
          </div>
        ) : error ? (
          <div className="raised-panel p-8 text-center">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <Button variant="outline" onClick={() => fetchProfile(playerId)}>Try Again</Button>
          </div>
        ) : profile ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">{profile.playerName || "A music fan"}</h1>
                <p className="text-xs text-muted-foreground font-mono">{profile.playerId}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
                Sign Out
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile icon={Trophy} label="Lifetime points" value={profile.points} />
              <StatTile icon={Music2} label="Solo games played" value={profile.soloGamesPlayed} />
              <StatTile icon={CalendarDays} label="Daily challenges played" value={profile.dailyChallengesPlayed} />
              <StatTile icon={LinkIcon} label="Challenges played" value={profile.challengesPlayed} />
              <StatTile icon={Radio} label="Rooms played" value={profile.roomsPlayed} />
              <StatTile
                icon={TrendingUp}
                label="Average position"
                value={profile.avgPosition !== null ? `#${profile.avgPosition}` : "—"}
              />
              <StatTile icon={Award} label="Win rate" value={`${profile.winRatePct}%`} />
              <StatTile icon={Clock} label="Minutes played" value={profile.minutesPlayed} />
              <StatTile
                icon={Flame}
                label="Daily streak"
                value={profile.currentStreak}
                sublabel={`${profile.bestStreak} best`}
              />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
