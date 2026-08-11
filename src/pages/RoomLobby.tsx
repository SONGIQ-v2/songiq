import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Copy, Check, Users, Play, Crown, LogOut, Loader2, UserCircle, Music, Clock, Hash, UserX, Lightbulb, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Starfield } from "@/components/Starfield";
import songiqLogo from "@/assets/songiq-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlaylistCard } from "@/components/PlaylistCard";
import { DoubleTapHint } from "@/components/DoubleTapHint";
import { useAppleMusic } from "@/hooks/useAppleMusic";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMultiplayerGame } from "@/hooks/useMultiplayerGame";
import { useGameStore } from "@/lib/gameStore";
import { getKnownPlayerName } from "@/lib/challenges";
import { supabase } from "@/integrations/supabase/client";
import { PLAYLISTS, PLAYLIST_CATEGORIES, getPlaylistById, type PlaylistCategory } from "@/lib/playlists";
import { getMotionVariants, CARD_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

const MUSIC_FACTS = [
  "Fela Kuti pioneered Afrobeat in the 1970s, fusing highlife, jazz and funk with Yoruba rhythms.",
  "Nigeria's music industry is estimated to be worth hundreds of millions of dollars, one of Africa's largest.",
  "Amapiano, born in South African townships in the mid-2010s, blends deep house, jazz and kwaito.",
  "Miriam Makeba, \"Mama Africa,\" was the first African artist to win a Grammy Award, in 1966.",
  "Highlife music originated in Ghana in the early 20th century, blending Akan melodies with Western instruments.",
  "Burna Boy's \"Twice As Tall\" made him the first Nigerian artist to win a Grammy for Best Global Music Album.",
  "The talking drum, used across West Africa, can mimic the tones and rhythms of spoken language.",
  "Youssou N'Dour helped popularize mbalax, blending Senegalese sabar drumming with Cuban and jazz influences.",
  "Wizkid's \"Essence\" was the first Nigerian song to enter the Billboard Hot 100.",
  "King Sunny Adé turned down major label deals in the 1980s to keep creative control of his juju music.",
  "Bongo Flava emerged in Tanzania in the 1990s, mixing American hip-hop with taarab and dansi music.",
  "The kora, a 21-string harp-lute, has been played by West African griots for over 700 years.",
  "South Africa's kwaito genre slowed down house music tempos to create its own distinct township sound.",
  "Angélique Kidjo has won five Grammy Awards and is one of Africa's best-selling music exports.",
  "Ghana's hiplife genre, pioneered in the 1990s, blends highlife with hip-hop and rap in local languages.",
  "Tems became the first Nigerian and African woman to win a Grammy for a featured performance, on \"Wait for U.\"",
  "The human ear can typically distinguish over 1,400 different pitches within its hearing range.",
  "Music streaming from Africa has grown faster than almost any other region over the past five years.",
  "Davido's \"Timeless\" album debuted at number one on Billboard's Top Current Albums chart in the US.",
  "The djembe drum's name comes from a Bambara phrase meaning \"everyone gather together.\"",
] as const;

export default function RoomLobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("afrobeats-chill");
  const [selectedRounds, setSelectedRounds] = useState(10);
  const [selectedTime, setSelectedTime] = useState(15);
  const [isStarting, setIsStarting] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [playlistImages, setPlaylistImages] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<"all" | PlaylistCategory>("all");
  const [artistsOnly, setArtistsOnly] = useState(false);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [factIndex, setFactIndex] = useState(0);
  const [showFactsModal, setShowFactsModal] = useState(false);

  // Ambient "Did You Know" facts — rotate one every few seconds while people wait
  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex((i) => (i + 1) % MUSIC_FACTS.length);
    }, 7000);
    return () => clearInterval(interval);
  }, []);
  const shouldReduceMotion = useReducedMotion();
  const { container, pop } = getMotionVariants(!!shouldReduceMotion);

  const { getPlaylistTracks } = useAppleMusic();

  const { initializeAuth, setPlayer, setRoom: setStoreRoom, playerName } = useGameStore();

  const {
    room,
    players,
    loading,
    error,
    gameStatus,
    startGame,
    toggleReady,
    leaveRoom,
    isHost,
    playerId,
    isTerminated,
    kickPlayer,
  } = useMultiplayerGame(code || "");

  // Kicked detection: if I was in the room but my row is gone, redirect.
  const wasInRoomRef = useRef(false);
  useEffect(() => {
    if (!playerId || loading) return;
    const me = players.find((p) => p.player_id === playerId);
    if (me) {
      wasInRoomRef.current = true;
    } else if (wasInRoomRef.current && room && !isHost) {
      toast.error("You were removed from the room by the host");
      navigate("/multiplayer");
    }
  }, [players, playerId, loading, room, isHost, navigate]);

  // Helper: set username cookie (reading goes through getKnownPlayerName,
  // which also checks the profile's saved name)
  const setUsernameCookie = (name: string) => {
    const maxAge = 365 * 24 * 60 * 60; // 1 year
    document.cookie = `songiq_username=${encodeURIComponent(name)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  };

  // Sync settings from room data (for guests getting real-time updates)
  useEffect(() => {
    if (room?.category) setSelectedCategory(room.category);
    if (room?.total_rounds) setSelectedRounds(room.total_rounds);
    if ((room as any)?.time_per_round) setSelectedTime((room as any).time_per_round);
  }, [room?.category, room?.total_rounds, (room as any)?.time_per_round]);

  // Ensure anonymous auth is initialized for guests landing here from a shared link
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Pre-fill join name from the profile/cookie, so returning players never
  // see an empty field even when the modal below still shows the input.
  useEffect(() => {
    const saved = getKnownPlayerName();
    if (saved) setJoinName(saved);
  }, []);

  const hasKnownName = Boolean(getKnownPlayerName());


  // Fetch playlist images from API
  useEffect(() => {
    const fetchImages = async () => {
      for (const playlist of PLAYLISTS) {
        try {
          const result = await getPlaylistTracks(playlist.searchTerms, playlist.name, 5, playlist.isArtist);
          if (result?.playlistImage) {
            setPlaylistImages((prev) => ({ ...prev, [playlist.id]: result.playlistImage }));
          }
        } catch {}
      }
    };
    fetchImages();
  }, [getPlaylistTracks]);

  // Show name modal if player is not in the room yet
  useEffect(() => {
    if (!loading && room && playerId && players.length > 0) {
      const isInRoom = players.some((p) => p.player_id === playerId);
      if (!isInRoom) {
        setShowNameModal(true);
      }
    } else if (!loading && room && playerId && players.length === 0) {
      setShowNameModal(true);
    }
  }, [loading, room, playerId, players]);

  const handleJoinWithName = async () => {
    if (!joinName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!room || !playerId) return;

    setIsJoiningRoom(true);
    try {
      // Check if room is still accepting players
      if (room.status !== "waiting") {
        toast.error("Game already in progress");
        setIsJoiningRoom(false);
        return;
      }

      await supabase.from("room_players").insert({
        room_id: room.id,
        player_id: playerId,
        player_name: joinName.trim(),
        avatar_index: Math.floor(Math.random() * 8) + 1,
        is_host: false,
        is_ready: true,
      });

      setPlayer(joinName.trim(), 1);
      setStoreRoom(room.id, room.room_code, false);
      setUsernameCookie(joinName.trim());
      setShowNameModal(false);
    } catch (err) {
      console.error("Error joining room:", err);
      toast.error("Failed to join room");
    } finally {
      setIsJoiningRoom(false);
    }
  };

  // Navigate to game when it starts (pre_game = synchronized 5s countdown
  // before round 1, shown on the game screen so audio can preload there)
  useEffect(() => {
    if ((gameStatus === "pre_game" || gameStatus === "playing") && room) {
      navigate(`/room/${code}/game`);
    }
  }, [gameStatus, room, code, navigate]);

  // Redirect home when host terminates the room
  useEffect(() => {
    if (isTerminated) {
      toast.error("The host has closed the room");
      navigate("/");
    }
  }, [isTerminated, navigate]);

  const handleCopyCode = async () => {
    if (!room) return;
    const shareUrl = `${window.location.origin}/room/${room.room_code}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Room link copied!");
    trackEvent("room_link_copy", { room_code: room.room_code });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = async (playlistId: string = selectedCategory) => {
    setIsStarting(true);
    // Update room settings before starting
    if (room) {
      await supabase.from("game_rooms").update({
        total_rounds: selectedRounds,
        time_per_round: selectedTime,
      }).eq("id", room.id);
    }
    trackEvent("multiplayer_game_start", {
      room_code: room?.room_code,
      category: playlistId,
      playlist_name: getPlaylistById(playlistId)?.name,
      rounds: selectedRounds,
      time_per_round: selectedTime,
      player_count: players.length,
    });
    await startGame(playlistId);
    setIsStarting(false);
  };

  const handleLeaveRoom = async () => {
    await leaveRoom();
    navigate("/multiplayer");
  };

  const handleUpdateName = async () => {
    const newName = editName.trim();
    if (!newName || !room || !playerId) return;
    try {
      await supabase
        .from("room_players")
        .update({ player_name: newName })
        .eq("room_id", room.id)
        .eq("player_id", playerId);
      setPlayer(newName, currentPlayer?.avatar_index ?? 1);
      setUsernameCookie(newName);
      setShowProfileModal(false);
      toast.success("Name updated!");
    } catch {
      toast.error("Failed to update name");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        <Starfield />
        <div className="flex flex-col items-center gap-4 z-10">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        <Starfield />
        <div className="text-center z-10">
          <p className="text-destructive mb-4">{error || "Room not found"}</p>
          <Button onClick={() => navigate("/multiplayer")}>Back to Multiplayer</Button>
        </div>
      </div>
    );
  }

  const currentPlayer = players.find((p) => p.player_id === playerId);
  const canStart = isHost && players.length >= 2;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Helmet>
        <title>{`Join Room ${code ?? ""} — Multiplayer Music Quiz | SongIQ`}</title>
        <meta name="description" content="Join a private SongIQ multiplayer music quiz room. Pick a nickname and play live with friends across Afrobeats, Pop and more." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href={`https://songiq.io/room/${code ?? ""}`} />
        <meta property="og:title" content={`Join Room ${code ?? ""} — Multiplayer Music Quiz | SongIQ`} />
        <meta property="og:description" content="A friend invited you to a live multiplayer music quiz on SongIQ. Tap to join." />
        <meta property="og:url" content={`https://songiq.io/room/${code ?? ""}`} />
      </Helmet>
      {/* Name Modal for joining players */}
      <Dialog open={showNameModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{hasKnownName ? `Join as ${joinName}?` : "Enter Your Name"}</DialogTitle>
            <DialogDescription>
              {hasKnownName ? "You're about to join this room" : "Choose a nickname to join the room"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!hasKnownName && (
              <Input
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="Your nickname"
                aria-label="Your nickname"
                maxLength={20}
                className="text-center text-lg"
                onKeyDown={(e) => e.key === "Enter" && handleJoinWithName()}
                autoFocus
              />
            )}
            <Button
              variant="gold"
              size="lg"
              className="w-full"
              onClick={handleJoinWithName}
              disabled={isJoiningRoom || !joinName.trim()}
            >
              {isJoiningRoom ? "Joining..." : "Join Room"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Starfield />
      {/* Custom header with Leave Room instead of menu */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-background/60 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center">
              <img src={songiqLogo} alt="SongIQ — Music Trivia Game" className="h-8 md:h-10 w-auto" />
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5">
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Leave</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave Room?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {isHost
                      ? "As the host, leaving will close the room for everyone."
                      : "Are you sure you want to leave the room?"}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Stay</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLeaveRoom}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Leave
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Open profile and edit nickname"
            onClick={() => {
              setEditName(currentPlayer?.player_name || playerName || "");
              setShowProfileModal(true);
            }}
            className="text-foreground/70 hover:text-foreground"
          >
            <UserCircle className="w-6 h-6" />
          </Button>
        </div>
      </header>

      <main className="relative z-10 pt-24 pb-12 px-4">
        <h1 className="sr-only">Multiplayer Room Lobby</h1>
        <div className="max-w-2xl lg:max-w-[1400px] mx-auto">
          {/* Waiting message for non-host */}
          {!isHost && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-6"
            >
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                ⏳ Waiting for host to start the game
                <span className="inline-flex">
                  <span className="animate-[bounce_1.4s_infinite_0ms] text-lg">.</span>
                  <span className="animate-[bounce_1.4s_infinite_200ms] text-lg">.</span>
                  <span className="animate-[bounce_1.4s_infinite_400ms] text-lg">.</span>
                </span>
              </p>
            </motion.div>
          )}

          <motion.div
            className="room-lobby-grid"
            variants={container(0.1)}
            initial="hidden"
            animate="show"
          >
            {/* Host Controls or Guest Settings View, plus Did You Know facts underneath */}
            <div style={{ gridArea: "settings" }} className="space-y-6">
            {isHost ? (
              <motion.div variants={pop} className="raised-panel p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="w-5 h-5 text-gold" />
                  <h2 className="font-bold text-xl">Game Settings</h2>
                </div>

                <div className="space-y-5">
                  {/* Playlist picker — tabs + grid, same pattern as Solo Play */}
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium mb-3">
                      <Music className="w-4 h-4 text-primary" />
                      Select Playlist
                    </label>
                    <DoubleTapHint />
                    <div className="flex flex-wrap gap-2 mb-4">
                      {PLAYLIST_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setActiveCategory(cat.id);
                            setArtistsOnly(false);
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide transition-all border",
                            activeCategory === cat.id
                              ? "bg-primary text-primary-foreground border-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                              : "bg-card/40 text-muted-foreground border-border/40 hover:text-foreground hover:border-border"
                          )}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const categoryPlaylists = activeCategory === "all"
                        ? PLAYLISTS
                        : PLAYLISTS.filter((p) => p.category === activeCategory);
                      const hasArtistsInCategory = categoryPlaylists.some((p) => p.isArtist);
                      const artistFiltered = artistsOnly
                        ? categoryPlaylists.filter((p) => p.isArtist)
                        : categoryPlaylists;
                      const query = playlistSearch.trim().toLowerCase();
                      const gridPlaylists = query
                        ? artistFiltered.filter((p) => p.name.toLowerCase().includes(query))
                        : artistFiltered;
                      return (
                        <>
                          {hasArtistsInCategory && (
                            <div className="flex gap-2 mb-3">
                              <button
                                onClick={() => setArtistsOnly(false)}
                                className={cn(
                                  "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
                                  !artistsOnly ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                All
                              </button>
                              <button
                                onClick={() => setArtistsOnly(true)}
                                className={cn(
                                  "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
                                  artistsOnly ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                Artists
                              </button>
                            </div>
                          )}
                    <div className="relative max-w-xs mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={playlistSearch}
                        onChange={(e) => setPlaylistSearch(e.target.value)}
                        placeholder="Search playlists…"
                        aria-label="Search playlists"
                        className="pl-9 h-9 text-sm"
                      />
                    </div>
                    {gridPlaylists.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No playlists match "{playlistSearch.trim()}"
                      </p>
                    ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {gridPlaylists.map((playlist) => (
                        <PlaylistCard
                          key={playlist.id}
                          playlist={playlist}
                          imageUrl={playlistImages[playlist.id]}
                          isSelected={selectedCategory === playlist.id}
                          onClick={async () => {
                            setSelectedCategory(playlist.id);
                            if (room) {
                              await supabase.from("game_rooms").update({ category: playlist.id }).eq("id", room.id);
                            }
                          }}
                          onDoubleClick={() => {
                            if (canStart && !isStarting) handleStartGame(playlist.id);
                          }}
                        />
                      ))}
                    </div>
                    )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Number of Songs + Time per Song — one row, visually separated from the playlist picker above */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 mt-1 border-t border-border/50">
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium mb-3">
                        <Hash className="w-4 h-4 text-primary" />
                        Number of Songs
                      </label>
                      <div className="flex gap-1.5">
                        {[5, 10, 15, 20].map((n) => (
                          <button
                            key={n}
                            onClick={async () => {
                              setSelectedRounds(n);
                              if (room) {
                                await supabase.from("game_rooms").update({ total_rounds: n }).eq("id", room.id);
                              }
                            }}
                            className={`flex-1 py-2 rounded-lg border-2 text-xs font-bold transition-all duration-200 ${
                              selectedRounds === n
                                ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.2)]"
                                : "border-border/50 bg-card/50 text-muted-foreground hover:border-border hover:bg-card/80"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium mb-3">
                        <Clock className="w-4 h-4 text-primary" />
                        Time per Song
                      </label>
                      <div className="flex gap-1.5">
                        {[10, 15, 20, 30].map((t) => (
                          <button
                            key={t}
                            onClick={async () => {
                              setSelectedTime(t);
                              if (room) {
                                await supabase.from("game_rooms").update({ time_per_round: t }).eq("id", room.id);
                              }
                            }}
                            className={`flex-1 py-2 rounded-lg border-2 text-xs font-bold transition-all duration-200 ${
                              selectedTime === t
                                ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.2)]"
                                : "border-border/50 bg-card/50 text-muted-foreground hover:border-border hover:bg-card/80"
                            }`}
                          >
                            {t}s
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="gold"
                    size="lg"
                    className="w-full"
                    onClick={() => handleStartGame()}
                    disabled={!canStart || isStarting}
                  >
                    <Play className="w-5 h-5 mr-2" />
                    {isStarting ? "Starting..." : players.length < 2 ? "Need at least 2 players" : "Start Game"}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div variants={pop} className="raised-panel p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="w-5 h-5 text-gold" />
                  <h2 className="font-bold text-xl">Game Settings</h2>
                </div>
                <div className="space-y-4">
                  {/* Selected playlist — same card the host sees while picking, broadcast live */}
                  {(() => {
                    const playlistDisplay = (
                      <div className="w-full max-w-[220px] mx-auto pointer-events-none">
                        <PlaylistCard
                          playlist={PLAYLISTS.find((p) => p.id === selectedCategory) ?? PLAYLISTS[0]}
                          imageUrl={playlistImages[selectedCategory]}
                          isSelected
                          onClick={() => {}}
                        />
                      </div>
                    );
                    const songsStat = (
                      <div className="text-center p-3 rounded-xl bg-card/50 border border-border/50">
                        <Hash className="w-4 h-4 text-primary mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Songs</p>
                        <p className="text-sm font-bold text-foreground mt-0.5">{selectedRounds}</p>
                      </div>
                    );
                    const timeStat = (
                      <div className="text-center p-3 rounded-xl bg-card/50 border border-border/50">
                        <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Time</p>
                        <p className="text-sm font-bold text-foreground mt-0.5">{selectedTime}s</p>
                      </div>
                    );
                    return (
                      <>
                        {/* Mobile: playlist row, then Songs + Time side by side */}
                        <div className="sm:hidden space-y-4">
                          {playlistDisplay}
                          <div className="grid grid-cols-2 gap-3">
                            {songsStat}
                            {timeStat}
                          </div>
                        </div>

                        {/* Desktop: 2 columns — playlist spans both rows, Songs/Time stacked beside it */}
                        <div className="hidden sm:grid sm:grid-cols-2 sm:gap-4">
                          <div className="row-span-2 flex items-center">{playlistDisplay}</div>
                          {songsStat}
                          {timeStat}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            )}

            {/* Did You Know — guests only, ambient facts on desktop, tap-to-open modal on mobile */}
            {!isHost && (
              <>
                <motion.div variants={pop} className="raised-panel px-6 py-10 hidden lg:block text-center">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Lightbulb className="w-5 h-5 text-gold" />
                    <h2 className="font-bold text-xl">Did You Know?</h2>
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={factIndex}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={CARD_SPRING}
                      className="text-xl text-muted-foreground leading-relaxed max-w-md mx-auto"
                    >
                      {MUSIC_FACTS[factIndex]}
                    </motion.p>
                  </AnimatePresence>
                </motion.div>

                <motion.button
                  variants={pop}
                  onClick={() => setShowFactsModal(true)}
                  className="raised-panel p-4 flex items-center justify-center gap-2 text-sm font-semibold text-gold w-full lg:hidden"
                >
                  <Lightbulb className="w-4 h-4" />
                  Wanna see some music facts while you wait?
                </motion.button>
              </>
            )}
            </div>

            <div className="room-lobby-sidebar">
            {/* Room Code */}
            <motion.div variants={pop} style={{ gridArea: "roomcode" }} className="raised-panel p-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">Room Code</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-4xl font-bold tracking-widest text-primary">
                  {room.room_code}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy room invite link"
                  onClick={handleCopyCode}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Share this code with friends to join
              </p>
            </motion.div>

            {/* Players */}
            <motion.div variants={pop} style={{ gridArea: "players" }} className="raised-panel p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="font-bold">Players ({players.length}/{room.max_players})</h2>
              </div>

                <div className="grid grid-cols-5 gap-3">
                  <AnimatePresence mode="popLayout">
                    {[...players].sort((a, b) => {
                      if (a.is_host) return -1;
                      if (b.is_host) return 1;
                      return 0;
                    }).map((player) => (
                      <motion.div
                        key={player.player_id}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="relative"
                      >
                        <PlayerAvatar
                          name={player.player_name}
                          avatarIndex={player.avatar_index}
                          isHost={player.is_host}
                          size="md"
                        />
                        {isHost && !player.is_host && (
                          <button
                            onClick={async () => {
                              try {
                                await kickPlayer(player.player_id);
                                toast.success(`Removed ${player.player_name}`);
                              } catch {
                                toast.error("Failed to remove player");
                              }
                            }}
                            title={`Remove ${player.player_name}`}
                            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </motion.div>
                    ))}

                    {/* Empty slots */}
                    {Array.from({ length: room.max_players - players.length }).map((_, i) => (
                      <motion.div
                        key={`empty-${i}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center gap-1"
                      >
                        <div className="w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                          <span className="text-2xl text-muted-foreground/30">?</span>
                        </div>
                        <span className="text-sm text-muted-foreground">Waiting...</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Music Facts Modal (mobile) */}
      <Dialog open={showFactsModal} onOpenChange={setShowFactsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <Lightbulb className="w-5 h-5 text-gold" />
              Did You Know?
            </DialogTitle>
            <DialogDescription className="sr-only">A fun music fact while you wait</DialogDescription>
          </DialogHeader>
          <AnimatePresence mode="wait">
            <motion.p
              key={factIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={CARD_SPRING}
              className="text-lg text-center text-foreground/90 leading-relaxed py-6"
            >
              {MUSIC_FACTS[factIndex]}
            </motion.p>
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* Profile / Change Name Modal */}
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
              onKeyDown={(e) => e.key === "Enter" && handleUpdateName()}
              autoFocus
            />
            <Button
              variant="gold"
              size="lg"
              className="w-full"
              onClick={handleUpdateName}
              disabled={!editName.trim()}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
