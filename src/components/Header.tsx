import { Link } from "react-router-dom";
import songiqLogo from "@/assets/songiq-logo.png";
import { UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/gameStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export const Header = () => {
  const [showProfileModal, setShowProfileModal] = useState(false);
  const { playerName, setPlayer, avatarIndex } = useGameStore();
  const [editName, setEditName] = useState("");

  useEffect(() => {
    // Load saved name from localStorage
    const saved = localStorage.getItem("songiq_player_name");
    if (saved && !playerName) {
      setPlayer(saved, avatarIndex);
    }
  }, []);

  const handleSaveName = () => {
    const trimmed = editName.trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 20);
    if (trimmed.length < 1) {
      toast({ title: "Name must be at least 1 character", variant: "destructive" });
      return;
    }
    setPlayer(trimmed, avatarIndex);
    localStorage.setItem("songiq_player_name", trimmed);
    setShowProfileModal(false);
    toast({ title: "Name updated!", description: `You're now "${trimmed}"` });
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-background/60 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo - left aligned */}
          <Link to="/" className="flex items-center gap-0.5">
            <span className="font-display text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-[hsl(45,100%,60%)] to-[hsl(270,50%,45%)] bg-clip-text text-transparent">
              SONG IQ
            </span>
          </Link>

          {/* Right side actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditName(playerName || localStorage.getItem("songiq_player_name") || "");
                setShowProfileModal(true);
              }}
              className="text-foreground/70 hover:text-foreground"
            >
              <UserCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

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
