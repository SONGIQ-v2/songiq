import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGameStore } from "@/lib/gameStore";
import { generateRoomCode } from "@/lib/spotify";
import { supabase } from "@/integrations/supabase/client";
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

  // Initialize anonymous auth on mount
  useEffect(() => {
    const init = async () => {
      setIsAuthLoading(true);
      await initializeAuth();
      setIsAuthLoading(false);
    };
    init();
  }, [initializeAuth]);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      toast.error("Please enter your name");
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
          host_name: playerName,
          status: "waiting",
        })
        .select()
        .single();

      if (roomError) throw roomError;

      await supabase.from("room_players").insert({
        room_id: room.id,
        player_id: playerId, // Now using authenticated user ID
        player_name: playerName,
        avatar_index: Math.floor(Math.random() * 8) + 1,
        is_host: true,
      });

      setPlayer(playerName, 1);
      setRoom(room.id, code, true);
      navigate(`/room/${code}`);
    } catch (error) {
      console.error("Error creating room:", error);
      toast.error("Failed to create room");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      toast.error("Please enter your name");
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

      await supabase.from("room_players").insert({
        room_id: room.id,
        player_id: playerId, // Now using authenticated user ID
        player_name: playerName,
        avatar_index: Math.floor(Math.random() * 8) + 1,
        is_host: false,
      });

      setPlayer(playerName, 1);
      setRoom(room.id, roomCode.toUpperCase(), false);
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
      <Starfield />
      <Header />

      <main className="relative z-10 pt-24 pb-12 px-4">
        <div className="max-w-md mx-auto">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-secondary flex items-center justify-center">
              <Users className="w-10 h-10 text-primary" />
            </div>
            <h1 className="font-display text-3xl uppercase tracking-wide mb-2">
              Play with Friends
            </h1>
            <p className="text-muted-foreground">
              Create or join a room to play together
            </p>
          </motion.div>

          {/* Name Input */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <label className="block text-sm font-medium mb-2">Your Name</label>
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your nickname"
              maxLength={20}
              className="text-center text-lg"
            />
          </motion.div>

          {/* Create Room */}
          <motion.div
            className="game-card mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
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
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted-foreground text-sm">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Join Room */}
          <motion.div
            className="game-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <label className="block text-sm font-medium mb-2">Room Code</label>
            <Input
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
        </div>
      </main>
    </div>
  );
};

export default Multiplayer;
