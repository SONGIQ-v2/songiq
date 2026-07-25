import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGameStore } from "@/lib/gameStore";
import { generateRoomCode } from "@/lib/spotify";
import { supabase } from "@/integrations/supabase/client";
import { getMotionVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ArrowLeft, Users, Plus, LogIn, Loader2 } from "lucide-react";
import { toast } from "sonner";

const Multiplayer = () => {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const { playerId, isInitialized, initializeAuth, setPlayer, setRoom } = useGameStore();
  const shouldReduceMotion = useReducedMotion();
  const { container, pop, fade } = getMotionVariants(!!shouldReduceMotion);

  const getUsernameCookie = () => {
    const match = document.cookie.match(/(?:^|; )songiq_username=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "";
  };
  const setUsernameCookie = (name: string) => {
    const maxAge = 365 * 24 * 60 * 60;
    document.cookie = `songiq_username=${encodeURIComponent(name)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  };

  // Initialize anonymous auth and load saved name
  useEffect(() => {
    const init = async () => {
      setIsAuthLoading(true);
      await initializeAuth();
      setIsAuthLoading(false);
    };
    init();
    const saved = getUsernameCookie();
    if (saved) setPlayerName(saved);
  }, [initializeAuth]);

  const sanitizeName = (name: string): string => {
    return name
      .trim()
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, 20);
  };

  const handleCreateRoom = async () => {
    const sanitized = sanitizeName(playerName);
    if (!sanitized) {
      toast.error("Please enter a valid name");
      return;
    }

    if (!playerId) {
      toast.error("Authentication not ready. Please wait...");
      return;
    }

    setIsCreating(true);
    const code = generateRoomCode();

    try {
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .insert({
          room_code: code,
          host_id: playerId, // Now using authenticated user ID
          host_name: sanitized,
          status: "waiting",
        })
        .select()
        .single();

      if (roomError) throw roomError;

      const avatarIndex = Math.floor(Math.random() * 8) + 1;
      await supabase.from("room_players").insert({
        room_id: room.id,
        player_id: playerId, // Now using authenticated user ID
        player_name: sanitized,
        avatar_index: avatarIndex,
        is_host: true,
      });

      setPlayer(sanitized, avatarIndex);
      setRoom(room.id, code, true);
      setUsernameCookie(playerName);
      navigate(`/room/${code}`);
    } catch (error) {
      console.error("Error creating room:", error);
      toast.error("Failed to create room");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    const sanitized = sanitizeName(playerName);
    if (!sanitized) {
      toast.error("Please enter a valid name");
      return;
    }
    if (!roomCode.trim()) {
      toast.error("Please enter a room code");
      return;
    }

    if (!playerId) {
      toast.error("Authentication not ready. Please wait...");
      return;
    }

    setIsJoining(true);

    try {
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .select()
        .eq("room_code", roomCode.toUpperCase())
        .maybeSingle();

      if (roomError) throw roomError;
      
      if (!room) {
        toast.error("Room not found");
        setIsJoining(false);
        return;
      }

      if (room.status !== "waiting") {
        toast.error("Game already in progress");
        setIsJoining(false);
        return;
      }

      const avatarIndex = Math.floor(Math.random() * 8) + 1;
      await supabase.from("room_players").insert({
        room_id: room.id,
        player_id: playerId, // Now using authenticated user ID
        player_name: sanitized,
        avatar_index: avatarIndex,
        is_host: false,
      });

      setPlayer(sanitized, avatarIndex);
      setRoom(room.id, roomCode.toUpperCase(), false);
      setUsernameCookie(playerName);
      navigate(`/room/${roomCode.toUpperCase()}`);
    } catch (error) {
      console.error("Error joining room:", error);
      toast.error("Failed to join room");
    } finally {
      setIsJoining(false);
    }
  };

  if (isAuthLoading || !isInitialized) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        <Starfield />
        <div className="flex flex-col items-center gap-4 z-10">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Helmet>
        <title>Multiplayer Music Quiz — Play with Friends Live | SongIQ</title>
        <meta name="description" content="Create or join a SongIQ multiplayer room. Up to 8 players, live scoring, share a link — race friends to guess the song first." />
        <link rel="canonical" href="https://songiq.io/multiplayer" />
        <meta property="og:title" content="SongIQ Multiplayer — Music Quiz with Friends" />
        <meta property="og:description" content="Up to 8 players, live scoring. Create a room, share the link, settle the group chat." />
        <meta property="og:url" content="https://songiq.io/multiplayer" />
      </Helmet>
      <Starfield />
      <Header />

      <main className="relative z-10 pt-24 pb-12 px-4">
        <motion.div className="max-w-md mx-auto" variants={container(0.1)} initial="hidden" animate="show">
          <motion.div variants={fade}>
            <Button variant="ghost" onClick={() => navigate("/")} className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </motion.div>

          <motion.div className="text-center mb-8" variants={fade}>
            <div className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <span className={cn("absolute inset-0 rounded-2xl", !shouldReduceMotion && "pulse-gold")} />
              <div
                className="relative w-full h-full rounded-2xl border-2 flex items-center justify-center"
                style={{
                  borderColor: "hsl(var(--gold-glow) / 0.6)",
                  background: "linear-gradient(160deg, hsl(var(--gold) / 0.35), hsl(var(--gold) / 0.15))",
                  boxShadow: "var(--shadow-card), var(--shadow-inset-highlight)",
                }}
              >
                <Users className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h1 className="font-display text-3xl mb-2">
              Play with Friends
            </h1>
            <p className="text-muted-foreground">
              Create or join a room to play together
            </p>
          </motion.div>

          {/* Name Input */}
          <motion.div className="mb-6" variants={fade}>
            <label htmlFor="mp-player-name" className="block text-sm font-medium mb-2">Your Name</label>
            <Input
              id="mp-player-name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your nickname"
              maxLength={20}
              className="text-center text-lg"
            />
          </motion.div>

          {/* Create Room */}
          <motion.div className="raised-panel p-6 mb-4" variants={pop}>
            <Button
              variant="gold"
              size="lg"
              className="w-full"
              onClick={handleCreateRoom}
              disabled={isCreating}
            >
              <Plus className="w-5 h-5 mr-2" />
              {isCreating ? "Creating..." : "Create a Room"}
            </Button>
          </motion.div>

          {/* Divider */}
          <motion.div className="flex items-center gap-4 my-6" variants={fade}>
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted-foreground text-sm">or</span>
            <div className="flex-1 h-px bg-border" />
          </motion.div>

          {/* Join Room */}
          <motion.div className="raised-panel p-6" variants={pop}>
            <label htmlFor="mp-room-code" className="block text-sm font-medium mb-2">Room Code</label>
            <Input
              id="mp-room-code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ABCD12"
              maxLength={6}
              className="text-center text-2xl tracking-widest font-bold mb-4"
            />
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleJoinRoom}
              disabled={isJoining}
            >
              <LogIn className="w-5 h-5 mr-2" />
              {isJoining ? "Joining..." : "Join Room"}
            </Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};

export default Multiplayer;
