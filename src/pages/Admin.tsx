import { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Lock, LinkIcon, RefreshCw, Users, Trophy, Radio, Flame } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Session } from "@supabase/supabase-js";

type DateRangeKey = "today" | "7d" | "30d";
const DATE_RANGES: { key: DateRangeKey; label: string; startDate: string }[] = [
  { key: "today", label: "Today", startDate: "today" },
  { key: "7d", label: "7 days", startDate: "7daysAgo" },
  { key: "30d", label: "30 days", startDate: "30daysAgo" },
];

interface ReportData {
  connected: boolean;
  eventCounts?: { event: string; count: number }[];
  dailyTotals?: { date: string; count: number }[];
  stats?: {
    playersWithStreak: number;
    challengesCreated: number;
    roomsCreated: number;
    activeRoomsNow: number;
  };
}

function formatGa4Date(d: string) {
  // "YYYYMMDD" -> "MMM D"
  if (d.length !== 8) return d;
  const date = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | string }) {
  return (
    <div className="text-center p-4 rounded-xl bg-card/50 border border-border/50">
      <Icon className="w-4 h-4 text-primary mx-auto mb-1.5" />
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function Admin() {
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [range, setRange] = useState<DateRangeKey>("7d");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const isAdmin = session && session !== "loading" && !session.user.is_anonymous;

  const fetchReport = useCallback(async (rangeKey: DateRangeKey) => {
    setLoadingReport(true);
    setReportError(null);
    const startDate = DATE_RANGES.find((r) => r.key === rangeKey)?.startDate ?? "7daysAgo";
    const { data, error } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "report", startDate, endDate: "today" },
    });
    if (error) {
      setReportError(error.message ?? "Failed to load report");
    } else {
      setReport(data as ReportData);
    }
    setLoadingReport(false);
  }, []);

  // Handle Google's OAuth redirect back to this page (?code=...)
  useEffect(() => {
    if (!isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) {
      fetchReport(range);
      return;
    }
    setConnecting(true);
    (async () => {
      const { error } = await supabase.functions.invoke("admin-analytics", {
        body: { action: "connect", code },
      });
      window.history.replaceState({}, "", "/admin");
      if (error) setReportError(error.message ?? "Failed to connect Google Analytics");
      setConnecting(false);
      fetchReport(range);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && !connecting) fetchReport(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError(error.message);
    setLoggingIn(false);
  };

  const handleConnectGoogle = () => {
    const clientId = import.meta.env.VITE_GA4_CLIENT_ID as string | undefined;
    if (!clientId) {
      setReportError("VITE_GA4_CLIENT_ID isn't set — add it to the environment first.");
      return;
    }
    const redirectUri = `${window.location.origin}/admin`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/analytics.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    window.location.href = url.toString();
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Admin — SongIQ</title>
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
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
              <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
                Sign Out
              </Button>
            </div>

            {connecting ? (
              <div className="raised-panel p-8 text-center">
                <RefreshCw className="w-6 h-6 text-primary mx-auto mb-3 animate-spin" />
                <p className="text-muted-foreground">Connecting Google Analytics...</p>
              </div>
            ) : report && !report.connected ? (
              <div className="raised-panel p-8 text-center">
                <LinkIcon className="w-8 h-8 text-primary mx-auto mb-4" />
                <p className="text-foreground font-semibold mb-2">Connect Google Analytics</p>
                <p className="text-muted-foreground text-sm mb-6">
                  One-time setup — sign in with the Google account that owns SongIQ's GA4 property.
                </p>
                <Button variant="gold" onClick={handleConnectGoogle}>
                  Connect Google Analytics
                </Button>
                {reportError && <p className="text-red-400 text-sm mt-4">{reportError}</p>}
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-6">
                  {DATE_RANGES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRange(r.key)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
                        range === r.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card/40 text-muted-foreground border-border/40 hover:text-foreground"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                {reportError && (
                  <p className="text-red-400 text-sm mb-4">{reportError}</p>
                )}

                {loadingReport || !report ? (
                  <div className="raised-panel p-8 text-center text-muted-foreground">Loading...</div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatTile icon={Flame} label="Players with a streak" value={report.stats?.playersWithStreak ?? 0} />
                      <StatTile icon={LinkIcon} label="Challenges created" value={report.stats?.challengesCreated ?? 0} />
                      <StatTile icon={Users} label="Rooms created" value={report.stats?.roomsCreated ?? 0} />
                      <StatTile icon={Radio} label="Active rooms now" value={report.stats?.activeRoomsNow ?? 0} />
                    </div>

                    <div className="raised-panel p-5">
                      <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-primary" /> Events by type
                      </p>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={report.eventCounts ?? []} layout="vertical" margin={{ left: 8, right: 24 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" horizontal={false} />
                            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                            <YAxis
                              type="category"
                              dataKey="event"
                              stroke="hsl(var(--muted-foreground))"
                              fontSize={11}
                              width={140}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            />
                            <Bar dataKey="count" fill="hsl(var(--gold))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="raised-panel p-5">
                      <p className="text-sm font-semibold text-foreground mb-4">Daily event volume</p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={(report.dailyTotals ?? []).map((d) => ({ ...d, label: formatGa4Date(d.date) }))}>
                            <defs>
                              <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                            <Tooltip
                              contentStyle={{
                                background: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="count"
                              stroke="hsl(var(--gold))"
                              strokeWidth={2}
                              fill="url(#goldFill)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
