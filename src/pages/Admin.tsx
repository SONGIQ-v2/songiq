import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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
import { Lock, LinkIcon, RefreshCw, Users, Trophy, Radio, Flame, Calendar, Target, ListMusic, Eye, Globe, MapPin, Share2, Clock, UserCheck, LayoutDashboard, BarChart3, Mic2, LogOut, FileText, ArrowLeft, Megaphone, Trash2 } from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SignInPointsNotification } from "@/components/SignInPointsNotification";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Session } from "@supabase/supabase-js";

type DateRangeKey = "today" | "7d" | "30d";
const DATE_RANGES: { key: DateRangeKey; label: string; startDate: string }[] = [
  { key: "today", label: "Today", startDate: "today" },
  { key: "7d", label: "7 days", startDate: "7daysAgo" },
  { key: "30d", label: "30 days", startDate: "30daysAgo" },
];

type AnalyticsTab = "charts" | "keyEvents";
const ANALYTICS_TABS: { key: AnalyticsTab; label: string }[] = [
  { key: "charts", label: "Charts" },
  { key: "keyEvents", label: "Key Events" },
];

type AdminSection = "overview" | "analytics" | "playlists" | "daily" | "geography" | "multiplayer" | "notifications" | "users";
const SECTIONS: { key: AdminSection; label: string; icon: typeof Users }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "playlists", label: "Playlists", icon: ListMusic },
  { key: "daily", label: "Daily Challenge", icon: Mic2 },
  { key: "geography", label: "Geography & Traffic", icon: Globe },
  { key: "multiplayer", label: "Multiplayer", icon: Radio },
  { key: "notifications", label: "Notifications", icon: Megaphone },
  { key: "users", label: "Signed-in Users", icon: UserCheck },
];

interface DailyChallengeInfo {
  today: { challengeDate: string; number: number; categoryName: string } | null;
  attemptsToday: number;
  playlists: { playlistName: string; isArtist: boolean; trackCount: number }[];
}

interface ReportData {
  connected: boolean;
  eventCounts?: { event: string; count: number }[];
  dailyTotals?: { date: string; count: number }[];
  topPlaylists?: { playlist: string; plays: number }[];
  topCountries?: { name: string; visitors: number }[];
  topCities?: { name: string; visitors: number }[];
  topPages?: { path: string; views: number }[];
  trafficSources?: { source: string; sessions: number }[];
  rooms?: {
    room_code: string;
    host_name: string;
    created_at: string;
    players: { player_id?: string; player_name: string; joined_at: string }[];
  }[];
  signedInUsers?: {
    id: string;
    name: string | null;
    nickname: string | null;
    email: string | null;
    createdAt: string;
    lastSignInAt: string | null;
    points: number;
  }[];
  stats?: {
    playersWithStreak: number;
    newSignedInInRange: number;
    signedInUsersAllTime: number;
    challengesCompletedInRange: number;
    challengesCompletedAllTime: number;
    roomsCreated: number;
    roomsCreatedInRange: number;
    soloGamesPlayedInRange: number;
    soloGamesPlayedAllTime: number;
    visitorsInRange: number;
    bounceRatePct: number;
    bounceRatePctAllTime: number;
    minutesPlayedInRange: number;
    minutesPlayedAllTime: number;
    minutesByMode: { mode: string; minutes: number }[];
    activeRoomsNow: number;
    dailyPlaysToday: number;
    dailyAvgScoreToday: number;
    topStreakPlayer: { name: string; streak: number } | null;
    uniquePlayersInRange: number;
    uniquePlayersEver: number;
  };
}

function formatEventName(event: string) {
  return event.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatGa4Date(d: string) {
  // "YYYYMMDD" -> "MMM D"
  if (d.length !== 8) return d;
  const date = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatTile({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof Users;
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

export default function Admin() {
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [range, setRange] = useState<DateRangeKey>("7d");
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("charts");
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [nicknameQuery, setNicknameQuery] = useState("");
  const [nicknameResults, setNicknameResults] = useState<{ playerId: string; playerName: string; points: number }[] | null>(null);
  const [searchingNickname, setSearchingNickname] = useState(false);
  const [nicknameSearchError, setNicknameSearchError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<
    { id: string; label: string; html: string; is_active: boolean; created_at: string }[] | null
  >(null);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [newNotifLabel, setNewNotifLabel] = useState("");
  const [newNotifHtml, setNewNotifHtml] = useState("");
  const [creatingNotification, setCreatingNotification] = useState(false);
  const [previewPoints, setPreviewPoints] = useState(350);
  const [signinThreshold, setSigninThreshold] = useState<number | null>(null);
  const [thresholdInput, setThresholdInput] = useState("200");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [dailyInfo, setDailyInfo] = useState<DailyChallengeInfo | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState("");
  const [settingDaily, setSettingDaily] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Requires the email-password provider, not just "not anonymous" -- once
  // players can link Google accounts, they'd otherwise pass this check too.
  const isAdmin =
    session &&
    session !== "loading" &&
    !session.user.is_anonymous &&
    (session.user.app_metadata?.providers as string[] | undefined)?.includes("email");

  const fetchReport = useCallback(async (rangeKey: DateRangeKey) => {
    setLoadingReport(true);
    setReportError(null);
    const startDate = DATE_RANGES.find((r) => r.key === rangeKey)?.startDate ?? "7daysAgo";
    const { data, error } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "report", startDate, endDate: "today", rangeKey },
    });
    if (error) {
      setReportError(error.message ?? "Failed to load report");
    } else {
      setReport(data as ReportData);
    }
    setLoadingReport(false);
  }, []);

  const handleNicknameSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicknameQuery.trim()) return;
    setSearchingNickname(true);
    setNicknameSearchError(null);
    const { data, error } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "search_players", nickname: nicknameQuery.trim() },
    });
    if (error) {
      setNicknameSearchError(error.message ?? "Search failed");
      setNicknameResults(null);
    } else {
      setNicknameResults((data as { players: { playerId: string; playerName: string; points: number }[] }).players);
    }
    setSearchingNickname(false);
  };

  const fetchNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    setNotificationsError(null);
    const { data, error } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "list_notifications" },
    });
    if (error) {
      setNotificationsError(error.message ?? "Failed to load notifications");
    } else {
      setNotifications(
        (data as { notifications: { id: string; label: string; html: string; is_active: boolean; created_at: string }[] })
          .notifications
      );
    }
    setLoadingNotifications(false);
  }, []);

  const fetchSigninThreshold = useCallback(async () => {
    // Publicly readable (RLS), same query NotificationBar itself uses --
    // no need to route a plain read through admin-analytics.
    const { data } = await (supabase as any)
      .from("site_settings")
      .select("signin_points_threshold")
      .eq("id", 1)
      .maybeSingle();
    const value = Number(data?.signin_points_threshold ?? 200);
    setSigninThreshold(value);
    setThresholdInput(String(value));
  }, []);

  useEffect(() => {
    if (isAdmin && activeSection === "notifications" && notifications === null) {
      fetchNotifications();
      fetchSigninThreshold();
    }
  }, [isAdmin, activeSection, notifications, fetchNotifications, fetchSigninThreshold]);

  const handleSaveThreshold = async () => {
    const parsed = Number(thresholdInput);
    if (!Number.isInteger(parsed) || parsed < 0) return;
    setSavingThreshold(true);
    setNotificationsError(null);
    const { error } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "update_signin_threshold", threshold: parsed },
    });
    if (error) setNotificationsError(error.message ?? "Failed to update threshold");
    else await fetchSigninThreshold();
    setSavingThreshold(false);
  };

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotifLabel.trim() || !newNotifHtml.trim()) return;
    setCreatingNotification(true);
    setNotificationsError(null);
    const { error } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "create_notification", label: newNotifLabel.trim(), html: newNotifHtml },
    });
    if (error) {
      setNotificationsError(error.message ?? "Failed to create notification");
    } else {
      setNewNotifLabel("");
      setNewNotifHtml("");
      await fetchNotifications();
    }
    setCreatingNotification(false);
  };

  const handleToggleNotification = async (id: string, active: boolean) => {
    setNotificationsError(null);
    const { error } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "toggle_notification", notificationId: id, isActive: active },
    });
    if (error) setNotificationsError(error.message ?? "Failed to update notification");
    else await fetchNotifications();
  };

  const handleDeleteNotification = async (id: string) => {
    setNotificationsError(null);
    const { error } = await supabase.functions.invoke("admin-analytics", {
      body: { action: "delete_notification", notificationId: id },
    });
    if (error) setNotificationsError(error.message ?? "Failed to delete notification");
    else await fetchNotifications();
  };

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
        body: { action: "connect", code, redirectUri: `${window.location.origin}/anonymous` },
      });
      window.history.replaceState({}, "", "/anonymous");
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

  const fetchDailyInfo = useCallback(async () => {
    setLoadingDaily(true);
    setDailyError(null);
    const { data, error } = await supabase.functions.invoke("admin-daily-challenge", {
      body: { action: "list" },
    });
    if (error || data?.error) {
      setDailyError(error?.message ?? data?.error ?? "Failed to load");
    } else {
      const info = data as DailyChallengeInfo;
      setDailyInfo(info);
      setSelectedPlaylist((prev) => prev || info.playlists[0]?.playlistName || "");
    }
    setLoadingDaily(false);
  }, []);

  useEffect(() => {
    if (isAdmin && activeSection === "daily" && !dailyInfo) fetchDailyInfo();
  }, [isAdmin, activeSection, dailyInfo, fetchDailyInfo]);

  const handleSetDaily = async () => {
    if (!selectedPlaylist) return;
    setSettingDaily(true);
    setDailyError(null);
    const { data, error } = await supabase.functions.invoke("admin-daily-challenge", {
      body: { action: "set", playlistName: selectedPlaylist },
    });
    setSettingDaily(false);
    setConfirmOverride(false);
    if (error || data?.error) {
      setDailyError(error?.message ?? data?.error ?? "Failed to set the Daily Challenge");
      return;
    }
    fetchDailyInfo();
  };

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
    const redirectUri = `${window.location.origin}/anonymous`;
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

      <main className="relative z-10 max-w-[1400px] mx-auto px-4 pt-16 pb-12">
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
              <div>
                <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
                <Link
                  to="/"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Back to site
                </Link>
              </div>
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
            ) : reportError && !report ? (
              // The report call itself failed (not just "not connected yet")
              // -- always offer a way forward instead of a dead end.
              <div className="raised-panel p-8 text-center">
                <p className="text-red-400 text-sm mb-6">{reportError}</p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={() => fetchReport(range)}>
                    Try Again
                  </Button>
                  <Button variant="gold" onClick={handleConnectGoogle}>
                    Reconnect Google Analytics
                  </Button>
                </div>
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
                  <div className="flex flex-col md:flex-row gap-6">
                    <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible md:w-56 shrink-0 pb-1 md:pb-0">
                      {SECTIONS.map((s) => {
                        const Icon = s.icon;
                        const isActive = activeSection === s.key;
                        return (
                          <button
                            key={s.key}
                            onClick={() => setActiveSection(s.key)}
                            className={cn(
                              "flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap text-left transition-all shrink-0",
                              isActive
                                ? "bg-primary text-primary-foreground shadow-lg"
                                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                            )}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            {s.label}
                          </button>
                        );
                      })}
                    </nav>

                    <div className="flex-1 min-w-0 space-y-6">
                    {activeSection === "overview" && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatTile icon={Calendar} label="Daily Challenge plays today" value={report.stats?.dailyPlaysToday ?? 0} />
                        <StatTile icon={Target} label="Avg Daily score today" value={report.stats?.dailyAvgScoreToday ?? 0} />
                        <StatTile
                          icon={Flame}
                          label="Highest active streak"
                          value={report.stats?.topStreakPlayer?.streak ?? 0}
                          sublabel={report.stats?.topStreakPlayer?.name}
                        />
                        <StatTile
                          icon={Users}
                          label="Unique players"
                          value={report.stats?.uniquePlayersInRange ?? 0}
                          sublabel={`${report.stats?.uniquePlayersEver ?? 0} all-time`}
                        />
                        <StatTile
                          icon={UserCheck}
                          label="New sign-ins"
                          value={report.stats?.newSignedInInRange ?? 0}
                          sublabel={`${report.stats?.signedInUsersAllTime ?? 0} all-time`}
                        />
                        <StatTile icon={Eye} label="Visitors" value={report.stats?.visitorsInRange ?? 0} sublabel="in selected range" />
                        <StatTile
                          icon={LogOut}
                          label="Bounce rate"
                          value={`${report.stats?.bounceRatePct ?? 0}%`}
                          sublabel={`${report.stats?.bounceRatePctAllTime ?? 0}% all-time`}
                        />
                        <StatTile
                          icon={Clock}
                          label="Minutes played"
                          value={report.stats?.minutesPlayedInRange ?? 0}
                          sublabel={`${report.stats?.minutesPlayedAllTime ?? 0} all-time`}
                        />
                        <StatTile
                          icon={Trophy}
                          label="Solo games played"
                          value={report.stats?.soloGamesPlayedInRange ?? 0}
                          sublabel={`${report.stats?.soloGamesPlayedAllTime ?? 0} all-time`}
                        />
                        <StatTile
                          icon={LinkIcon}
                          label="Challenges completed"
                          value={report.stats?.challengesCompletedInRange ?? 0}
                          sublabel={`${report.stats?.challengesCompletedAllTime ?? 0} all-time`}
                        />
                        <StatTile
                          icon={Users}
                          label="Rooms created"
                          value={report.stats?.roomsCreatedInRange ?? 0}
                          sublabel={`${report.stats?.roomsCreated ?? 0} all-time`}
                        />
                        <StatTile icon={Radio} label="Active rooms now" value={report.stats?.activeRoomsNow ?? 0} />
                      </div>
                    )}

                    {activeSection === "analytics" && (
                      <div>
                        <div className="flex gap-2 mb-6">
                          {ANALYTICS_TABS.map((t) => (
                            <button
                              key={t.key}
                              onClick={() => setAnalyticsTab(t.key)}
                              className={cn(
                                "px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
                                analyticsTab === t.key
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card/40 text-muted-foreground border-border/40 hover:text-foreground"
                              )}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        {analyticsTab === "charts" ? (
                          <div className="grid lg:grid-cols-2 gap-6">
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
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {(report.eventCounts ?? []).length > 0 ? (
                              (report.eventCounts ?? []).map((e) => (
                                <StatTile key={e.event} icon={Target} label={formatEventName(e.event)} value={e.count} />
                              ))
                            ) : (
                              <p className="text-muted-foreground text-sm col-span-full">No key events in this range yet.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {activeSection === "playlists" && (
                      report.topPlaylists && report.topPlaylists.length > 0 ? (
                        <div className="raised-panel p-5">
                          <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                            <ListMusic className="w-4 h-4 text-primary" /> Most-played playlists
                          </p>
                          <div className="space-y-1.5">
                            {report.topPlaylists.map((p, i) => (
                              <div
                                key={p.playlist}
                                className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm bg-card/50"
                              >
                                <span className="font-semibold text-foreground flex items-center gap-2 min-w-0">
                                  <span className="text-muted-foreground w-5">#{i + 1}</span>
                                  <span className="truncate">{p.playlist}</span>
                                </span>
                                <span className="font-bold text-gold shrink-0">{p.plays}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="raised-panel p-8 text-center text-muted-foreground text-sm">No playlist plays in this range yet.</div>
                      )
                    )}

                    {activeSection === "daily" && (
                      <div className="raised-panel p-5 max-w-xl">
                        <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                          <Mic2 className="w-4 h-4 text-primary" /> Daily Challenge override
                        </p>

                        {loadingDaily && !dailyInfo ? (
                          <p className="text-muted-foreground text-sm">Loading…</p>
                        ) : (
                          <div className="space-y-4">
                            {dailyInfo?.today ? (
                              <div className="px-3 py-2.5 rounded-lg bg-card/50 text-sm">
                                <span className="text-muted-foreground">Today (#{dailyInfo.today.number}): </span>
                                <span className="font-bold text-foreground">{dailyInfo.today.categoryName}</span>
                                {dailyInfo.attemptsToday > 0 && (
                                  <span className="text-gold ml-2">
                                    · {dailyInfo.attemptsToday} {dailyInfo.attemptsToday === 1 ? "play" : "plays"} so far
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-sm">No challenge generated for today yet.</p>
                            )}

                            <div>
                              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                                Set today's playlist
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={selectedPlaylist}
                                  onChange={(e) => setSelectedPlaylist(e.target.value)}
                                  className="flex-1 h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                                >
                                  {(dailyInfo?.playlists ?? []).map((p) => (
                                    <option key={p.playlistName} value={p.playlistName}>
                                      {p.playlistName} {p.isArtist ? "(artist)" : ""} — {p.trackCount} tracks
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={fetchDailyInfo}
                                  disabled={loadingDaily}
                                  aria-label="Refresh"
                                >
                                  <RefreshCw className={cn("w-4 h-4", loadingDaily && "animate-spin")} />
                                </Button>
                              </div>
                            </div>

                            {dailyError && <p className="text-red-400 text-sm">{dailyError}</p>}

                            <Button
                              variant="gold"
                              disabled={!selectedPlaylist || settingDaily}
                              onClick={() => setConfirmOverride(true)}
                            >
                              {settingDaily ? "Setting…" : "Set as today's challenge"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {activeSection === "geography" && (
                      <div className="grid lg:grid-cols-3 gap-6">
                        {report.stats?.minutesByMode && report.stats.minutesByMode.length > 0 && (
                          <div className="raised-panel p-5">
                            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-primary" /> Time played by mode
                            </p>
                            <div className="space-y-1.5">
                              {report.stats.minutesByMode.map((m) => (
                                <div
                                  key={m.mode}
                                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm bg-card/50"
                                >
                                  <span className="font-semibold text-foreground capitalize">{m.mode}</span>
                                  <span className="font-bold text-gold shrink-0">{m.minutes}m</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {report.topCountries && report.topCountries.length > 0 && (
                          <div className="raised-panel p-5">
                            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                              <Globe className="w-4 h-4 text-primary" /> Top countries
                            </p>
                            <div className="space-y-1.5">
                              {report.topCountries.map((c, i) => (
                                <div
                                  key={c.name}
                                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm bg-card/50"
                                >
                                  <span className="font-semibold text-foreground flex items-center gap-2 min-w-0">
                                    <span className="text-muted-foreground w-5">#{i + 1}</span>
                                    <span className="truncate">{c.name}</span>
                                  </span>
                                  <span className="font-bold text-gold shrink-0">{c.visitors}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {report.topCities && report.topCities.length > 0 && (
                          <div className="raised-panel p-5">
                            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                              <MapPin className="w-4 h-4 text-primary" /> Top cities
                            </p>
                            <div className="space-y-1.5">
                              {report.topCities.map((c, i) => (
                                <div
                                  key={c.name}
                                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm bg-card/50"
                                >
                                  <span className="font-semibold text-foreground flex items-center gap-2 min-w-0">
                                    <span className="text-muted-foreground w-5">#{i + 1}</span>
                                    <span className="truncate">{c.name}</span>
                                  </span>
                                  <span className="font-bold text-gold shrink-0">{c.visitors}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {report.topPages && report.topPages.length > 0 && (
                          <div className="raised-panel p-5">
                            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-primary" /> Top pages
                            </p>
                            <div className="space-y-1.5">
                              {report.topPages.map((p, i) => (
                                <div
                                  key={p.path}
                                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm bg-card/50"
                                >
                                  <span className="font-semibold text-foreground flex items-center gap-2 min-w-0">
                                    <span className="text-muted-foreground w-5">#{i + 1}</span>
                                    <span className="truncate">{p.path}</span>
                                  </span>
                                  <span className="font-bold text-gold shrink-0">{p.views}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {report.trafficSources && report.trafficSources.length > 0 && (
                          <div className="raised-panel p-5">
                            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                              <Share2 className="w-4 h-4 text-primary" /> Traffic sources
                            </p>
                            <div className="space-y-1.5">
                              {report.trafficSources.map((s, i) => (
                                <div
                                  key={s.source}
                                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm bg-card/50"
                                >
                                  <span className="font-semibold text-foreground flex items-center gap-2 min-w-0">
                                    <span className="text-muted-foreground w-5">#{i + 1}</span>
                                    <span className="truncate">{s.source}</span>
                                  </span>
                                  <span className="font-bold text-gold shrink-0">{s.sessions}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeSection === "multiplayer" && (
                      report.rooms && report.rooms.length > 0 ? (
                        <div className="raised-panel p-5">
                          <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                            <Radio className="w-4 h-4 text-primary" /> Multiplayer rooms ({report.rooms.length})
                          </p>
                          <div className="max-h-[32rem] overflow-y-auto space-y-1.5">
                            {report.rooms.map((room) => {
                              const isExpanded = expandedRooms.has(room.room_code);
                              return (
                                <div key={room.room_code} className="rounded-lg bg-card/50 overflow-hidden">
                                  <button
                                    onClick={() =>
                                      setExpandedRooms((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(room.room_code)) next.delete(room.room_code);
                                        else next.add(room.room_code);
                                        return next;
                                      })
                                    }
                                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left"
                                  >
                                    <span className="font-semibold text-foreground flex items-center gap-2 min-w-0">
                                      <span className="font-mono text-primary shrink-0">{room.room_code}</span>
                                      <span className="truncate text-muted-foreground">
                                        hosted by {room.host_name}
                                      </span>
                                    </span>
                                    <span className="flex items-center gap-3 shrink-0">
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(room.created_at).toLocaleString()}
                                      </span>
                                      <span className="text-xs font-bold text-gold whitespace-nowrap">
                                        {room.players.length} {room.players.length === 1 ? "player" : "players"}
                                      </span>
                                    </span>
                                  </button>
                                  {isExpanded && (
                                    <div className="px-3 pb-2.5 pt-1 border-t border-border/40 space-y-1">
                                      {room.players.map((p, i) => (
                                        <div
                                          key={p.player_id ?? `${p.player_name}-${i}`}
                                          className="flex items-center justify-between text-xs"
                                        >
                                          <span className="flex items-center gap-2 min-w-0">
                                            <span className="text-foreground truncate">{p.player_name}</span>
                                            {p.player_id && (
                                              <Link
                                                to={`/anonymous/player/${p.player_id}`}
                                                target="_blank"
                                                className="font-mono text-primary hover:underline shrink-0"
                                                title={p.player_id}
                                              >
                                                {p.player_id.slice(0, 8)}…
                                              </Link>
                                            )}
                                          </span>
                                          <span className="text-muted-foreground shrink-0">
                                            {new Date(p.joined_at).toLocaleTimeString()}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="raised-panel p-8 text-center text-muted-foreground text-sm">No multiplayer rooms in this range yet.</div>
                      )
                    )}

                    {activeSection === "notifications" && (
                      <div className="space-y-6">
                        <div className="raised-panel p-5">
                          <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                            <Megaphone className="w-4 h-4 text-primary" /> Create a notification
                          </p>
                          <form onSubmit={handleCreateNotification} className="space-y-3">
                            <Input
                              value={newNotifLabel}
                              onChange={(e) => setNewNotifLabel(e.target.value)}
                              placeholder='Label (admin-facing only, e.g. "25% off promo")'
                            />
                            <Textarea
                              value={newNotifHtml}
                              onChange={(e) => setNewNotifHtml(e.target.value)}
                              placeholder="HTML shown to every visitor when this notification is active"
                              rows={4}
                              className="font-mono text-xs"
                            />
                            <Button
                              type="submit"
                              variant="gold"
                              disabled={creatingNotification || !newNotifLabel.trim() || !newNotifHtml.trim()}
                            >
                              {creatingNotification ? "Creating..." : "Create"}
                            </Button>
                          </form>
                        </div>

                        {notificationsError && <p className="text-red-400 text-sm">{notificationsError}</p>}

                        <div className="raised-panel p-5">
                          <p className="text-sm font-semibold text-foreground mb-4">
                            Notifications ({notifications?.length ?? 0})
                          </p>
                          {loadingNotifications ? (
                            <p className="text-muted-foreground text-sm">Loading...</p>
                          ) : notifications && notifications.length > 0 ? (
                            <div className="space-y-2">
                              {notifications.map((n) => (
                                <div key={n.id} className="rounded-lg bg-card/50 p-3">
                                  <div className="flex items-center justify-between gap-3 mb-1.5">
                                    <span className="font-semibold text-foreground text-sm truncate">{n.label}</span>
                                    <span className="flex items-center gap-2 shrink-0">
                                      <Switch
                                        checked={n.is_active}
                                        onCheckedChange={(checked) => handleToggleNotification(n.id, checked)}
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => handleDeleteNotification(n.id)}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground font-mono truncate">{n.html}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">No notifications yet.</p>
                          )}
                        </div>

                        <div className="raised-panel p-5">
                          <p className="text-sm font-semibold text-foreground mb-1">Built-in: sign in to save points</p>
                          <p className="text-xs text-muted-foreground mb-4">
                            When nothing above is active, anonymous players above the threshold below automatically
                            see this reminder. It can't be disabled, only its threshold can be adjusted.
                          </p>
                          <div className="flex items-center gap-3 mb-3">
                            <label className="text-xs text-muted-foreground">Minimum points to trigger:</label>
                            <Input
                              type="number"
                              value={thresholdInput}
                              onChange={(e) => setThresholdInput(e.target.value)}
                              className="w-28 h-8"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingThreshold || Number(thresholdInput) === signinThreshold}
                              onClick={handleSaveThreshold}
                            >
                              {savingThreshold ? "Saving..." : "Save"}
                            </Button>
                            {signinThreshold !== null && (
                              <span className="text-xs text-muted-foreground">Currently: {signinThreshold}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mb-3">
                            <label className="text-xs text-muted-foreground">Preview with points:</label>
                            <Input
                              type="number"
                              value={previewPoints}
                              onChange={(e) => setPreviewPoints(Number(e.target.value) || 0)}
                              className="w-28 h-8"
                            />
                          </div>
                          <div className="rounded-lg overflow-hidden border border-border/40">
                            <SignInPointsNotification points={previewPoints} />
                          </div>
                        </div>
                      </div>
                    )}

                    {activeSection === "users" && (
                      <div className="space-y-6">
                      <div className="raised-panel p-5">
                        <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-primary" /> Look up a player by nickname
                        </p>
                        <form onSubmit={handleNicknameSearch} className="flex gap-2 mb-4">
                          <Input
                            value={nicknameQuery}
                            onChange={(e) => setNicknameQuery(e.target.value)}
                            placeholder="Nickname (or part of one)"
                            className="flex-1"
                          />
                          <Button type="submit" variant="gold" disabled={searchingNickname || !nicknameQuery.trim()}>
                            {searchingNickname ? "Searching..." : "Search"}
                          </Button>
                        </form>
                        {nicknameSearchError && <p className="text-red-400 text-sm mb-3">{nicknameSearchError}</p>}
                        {nicknameResults && (
                          nicknameResults.length > 0 ? (
                            <div className="space-y-1.5">
                              {nicknameResults.map((p) => (
                                <div
                                  key={p.playerId}
                                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm bg-card/50"
                                >
                                  <span className="font-semibold text-foreground truncate">{p.playerName}</span>
                                  <span className="flex items-center gap-3 shrink-0">
                                    <span className="text-gold font-bold">{p.points} pts</span>
                                    <Link
                                      to={`/anonymous/player/${p.playerId}`}
                                      target="_blank"
                                      className="font-mono text-xs text-primary hover:underline"
                                      title={p.playerId}
                                    >
                                      {p.playerId.slice(0, 8)}…
                                    </Link>
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">No players found with that nickname.</p>
                          )
                        )}
                      </div>

                      {report.signedInUsers && report.signedInUsers.length > 0 ? (
                        <div className="raised-panel p-5">
                          <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                            <UserCheck className="w-4 h-4 text-primary" /> Signed-in users ({report.signedInUsers.length})
                          </p>
                          <div className="max-h-96 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Name</TableHead>
                                  <TableHead>Nickname</TableHead>
                                  <TableHead>Email</TableHead>
                                  <TableHead>ID</TableHead>
                                  <TableHead className="text-right">Points</TableHead>
                                  <TableHead className="text-right">Joined</TableHead>
                                  <TableHead className="text-right">Last sign-in</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {report.signedInUsers.map((u) => (
                                  <TableRow key={u.id}>
                                    <TableCell className="font-semibold text-foreground">{u.name || "—"}</TableCell>
                                    <TableCell className="text-muted-foreground">{u.nickname || "—"}</TableCell>
                                    <TableCell className="text-muted-foreground">{u.email || "—"}</TableCell>
                                    <TableCell>
                                      <Link
                                        to={`/anonymous/player/${u.id}`}
                                        target="_blank"
                                        className="font-mono text-xs text-primary hover:underline"
                                        title={u.id}
                                      >
                                        {u.id.slice(0, 8)}…
                                      </Link>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-gold">{u.points}</TableCell>
                                    <TableCell className="text-right text-muted-foreground text-xs">
                                      {new Date(u.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground text-xs">
                                      {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "—"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ) : (
                        <div className="raised-panel p-8 text-center text-muted-foreground text-sm">No signed-in users yet.</div>
                      )}
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <Dialog open={confirmOverride} onOpenChange={setConfirmOverride}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set today's Daily Challenge to "{selectedPlaylist}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dailyInfo?.today
              ? `This replaces today's challenge (currently "${dailyInfo.today.categoryName}").`
              : "This generates today's challenge."}
            {dailyInfo && dailyInfo.attemptsToday > 0 && (
              <span className="text-red-400 font-semibold">
                {" "}
                {dailyInfo.attemptsToday} {dailyInfo.attemptsToday === 1 ? "player has" : "players have"} already
                played today — their attempt{dailyInfo.attemptsToday === 1 ? "" : "s"} will be deleted.
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOverride(false)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={handleSetDaily} disabled={settingDaily}>
              {settingDaily ? "Setting…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
