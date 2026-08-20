import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGameStore } from "@/lib/gameStore";
import { getKnownPlayerName } from "@/lib/challenges";
import { generateRoomCode } from "@/lib/spotify";
import { supabase } from "@/integrations/supabase/client";
import { getMotionVariants } from "@/lib/motion";
import { ArrowLeft, Plus, LogIn, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

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
    const saved = getKnownPlayerName();
    if (saved) setPlayerName(saved);
  }, [initializeAuth]);

  // Skip asking for a nickname when one is already known (profile or the
  // multiplayer cookie) -- computed fresh each render, not from `playerName`
  // state, so there's no flash of the input before the mount effect fills it.
  const hasKnownName = Boolean(getKnownPlayerName());

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
      const { error: joinErr } = await supabase.from("room_players").insert({
        room_id: room.id,
        player_id: playerId, // Now using authenticated user ID
        player_name: sanitized,
        avatar_index: avatarIndex,
        is_host: true,
      });
      if (joinErr) throw joinErr;

      setPlayer(sanitized, avatarIndex);
      setRoom(room.id, code, true);
      setUsernameCookie(playerName);
      trackEvent("multiplayer_room_create", { room_code: code });
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
      // Via the RPC, not a direct table select -- game_rooms/room_players
      // are members-only now, and this caller isn't one yet. Also returns
      // the current player list, covering the capacity check below without
      // a second query.
      const { data: rpcData, error: roomError } = await (supabase as any).rpc("get_room_by_code", {
        p_code: roomCode.toUpperCase(),
      });

      if (roomError) throw roomError;

      if (!rpcData) {
        toast.error("Room not found");
        setIsJoining(false);
        return;
      }
      const room = rpcData.room;
      const players = rpcData.players as unknown[];

      if (room.status === "finished") {
        toast.error("This game has already ended");
        setIsJoining(false);
        return;
      }

      if (players.length >= room.max_players) {
        toast.error("Room is full");
        setIsJoining(false);
        return;
      }

      const avatarIndex = Math.floor(Math.random() * 8) + 1;
      const { error: joinErr } = await supabase.from("room_players").insert({
        room_id: room.id,
        player_id: playerId, // Now using authenticated user ID
        player_name: sanitized,
        avatar_index: avatarIndex,
        is_host: false,
      });
      if (joinErr) throw joinErr;

      setPlayer(sanitized, avatarIndex);
      setRoom(room.id, roomCode.toUpperCase(), false);
      setUsernameCookie(playerName);
      trackEvent("multiplayer_room_join", { room_code: roomCode.toUpperCase() });
      navigate(`/room/${roomCode.toUpperCase()}`);
    } catch (error) {
      console.error("Error joining room:", error);
      // A capacity race (two people squeezing into the last slot at once)
      // surfaces here as an RLS rejection from the DB-level cap, not the
      // pre-check above -- same friendly message either way.
      const isCapacityRejection = (error as { code?: string })?.code === "42501";
      toast.error(isCapacityRejection ? "Room is full" : "Failed to join room");
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

      <main className="relative z-10 pt-[79px] md:pt-[149px] pb-12 px-4">
        <motion.div className="max-w-[1000px] mx-auto" variants={container(0.1)} initial="hidden" animate="show">
          <motion.div variants={fade}>
            <Button variant="ghost" onClick={() => navigate("/")} className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </motion.div>

          <motion.div className="text-center mb-10" variants={fade}>
            <h1 className="glow-heading mb-2">Multiplayer Battle</h1>
            <p className="text-muted-foreground">
              Challenge your friends or join a room to battle in real-time music trivia.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 mt-[20px] md:mt-[100px]">
            {/* Create Room */}
            <motion.div className="raised-panel p-8 text-center flex flex-col items-center" variants={pop}>
              <div className="w-14 h-14 rounded-full bg-gold flex items-center justify-center mb-4">
                <Plus className="w-7 h-7 text-primary-foreground" />
              </div>
              <h2 className="font-display text-xl uppercase tracking-wide mb-1">Create Private Room</h2>
              <p className="text-muted-foreground text-sm mb-6">Battle with friends</p>
              {/* Name input — hidden once we already know their nickname */}
              {!hasKnownName && (
                <Input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your nickname"
                  maxLength={20}
                  className="text-center text-lg mb-3"
                  aria-label="Your Name"
                />
              )}
              <Button
                variant="gold"
                size="lg"
                className="w-full mt-auto"
                onClick={handleCreateRoom}
                disabled={isCreating}
              >
                <Plus className="w-5 h-5 mr-2" />
                {isCreating ? "Creating..." : "Create Room"}
              </Button>
            </motion.div>

            {/* Join Room */}
            <motion.div
              className="relative rounded-2xl border-2 p-8 text-center flex flex-col items-center overflow-hidden"
              style={{
                borderColor: "hsl(var(--gold-glow) / 0.8)",
                background: "var(--gradient-gold)",
                boxShadow: "0 8px 16px hsl(45 100% 60% / 0.35), var(--shadow-inset-highlight)",
              }}
              variants={pop}
            >
              <div className="w-14 h-14 rounded-full bg-background/15 flex items-center justify-center mb-4">
                <LogIn className="w-7 h-7 text-primary-foreground" />
              </div>
              <h2 className="font-display text-xl uppercase tracking-wide mb-1 text-primary-foreground">Join a Room</h2>
              <p className="text-primary-foreground/70 text-sm mb-6">Enter a code from a friend</p>
              <Input
                id="mp-room-code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABCD12"
                maxLength={6}
                aria-label="Room code"
                className="text-center text-2xl tracking-widest font-bold mb-4 bg-background/15 border-background/30 text-primary-foreground placeholder:text-primary-foreground/50"
              />
              <Button
                size="lg"
                className="w-full mt-auto bg-background text-foreground hover:bg-background/90"
                onClick={handleJoinRoom}
                disabled={isJoining}
              >
                <LogIn className="w-5 h-5 mr-2" />
                {isJoining ? "Joining..." : "Join Room"}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Multiplayer;
