import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Users, Play, Crown, LogOut, Loader2, UserCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { PLAYLISTS } from "@/lib/playlists";
import { toast } from "sonner";

export default function RoomLobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("afrobeats-chill");
  const [isStarting, setIsStarting] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState("");

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
  } = useMultiplayerGame(code || "");

  // Helper: get/set username cookie
  const getUsernameCookie = () => {
    const match = document.cookie.match(/(?:^|; )songiq_username=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "";
  };
  const setUsernameCookie = (name: string) => {
    const maxAge = 365 * 24 * 60 * 60; // 1 year
    document.cookie = `songiq_username=${encodeURIComponent(name)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  };

  // Pre-fill join name from cookie
  useEffect(() => {
    const saved = getUsernameCookie();
    if (saved) setJoinName(saved);
  }, []);

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

  // Navigate to game when it starts
  useEffect(() => {
    if (gameStatus === "playing" && room) {
      navigate(`/room/${code}/game`);
    }
  }, [gameStatus, room, code, navigate]);

  const handleCopyCode = async () => {
    if (!room) return;
    const shareUrl = `${window.location.origin}/room/${room.room_code}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Room link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = async () => {
    setIsStarting(true);
    await startGame(selectedCategory);
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
  const allPlayersReady = players.length >= 2 && players.filter((p) => !p.is_host).every((p) => p.is_ready);
  const canStart = isHost && players.length >= 2 && allPlayersReady;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Name Modal for joining players */}
      <Dialog open={showNameModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Enter Your Name</DialogTitle>
            <DialogDescription>
              Choose a nickname to join the room
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Your nickname"
              maxLength={20}
              className="text-center text-lg"
              onKeyDown={(e) => e.key === "Enter" && handleJoinWithName()}
              autoFocus
            />
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
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
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

          <Link to="/" className="flex items-center gap-2">
            <span className="font-display text-2xl md:text-3xl tracking-tight text-foreground">Song</span>
            <span className="font-display text-2xl md:text-3xl tracking-tight text-primary">IQ</span>
          </Link>

          <Button
            variant="ghost"
            size="icon"
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
        <div className="max-w-2xl mx-auto">
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

          {/* Room Code Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="game-card text-center mb-6"
          >
            <p className="text-sm text-muted-foreground mb-2">Room Code</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl font-bold tracking-widest text-primary">
                {room.room_code}
              </span>
              <Button
                variant="ghost"
                size="icon"
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

          {/* Players Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="game-card mb-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="font-bold">Players ({players.length}/{room.max_players})</h2>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {players.map((player) => (
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
                    {/* Ready indicator - only show when ready */}
                    {!player.is_host && player.is_ready && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                        Ready
                      </div>
                    )}
                    {player.player_id === playerId && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
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

          {/* Host Controls or Waiting Message */}
          {isHost ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="game-card mb-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-5 h-5 text-gold" />
                <h2 className="font-bold">Host Controls</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAYLISTS.map((playlist) => (
                        <SelectItem key={playlist.id} value={playlist.id}>
                          {playlist.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="gold"
                  size="lg"
                  className="w-full"
                  onClick={handleStartGame}
                  disabled={!canStart || isStarting}
                >
                  <Play className="w-5 h-5 mr-2" />
                  {isStarting ? "Starting..." : players.length < 2 ? "Need at least 2 players" : !allPlayersReady ? "Waiting for players..." : "Start Game"}
                </Button>

                {players.length >= 2 && !allPlayersReady && (
                  <p className="text-sm text-center text-muted-foreground">
                    Waiting for all players to be ready
                  </p>
                )}
              </div>
            </motion.div>
          ) : null}

        </div>
      </main>

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
