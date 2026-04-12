import { Link } from "react-router-dom";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const Header = () => {
  const [isMuted, setIsMuted] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-background/60 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo - left aligned */}
        <Link to="/" className="flex items-center gap-0.5">
          <span className="font-display text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-green-400 via-cyan-400 to-purple-500 bg-clip-text text-transparent">
            SONG IQ
          </span>
        </Link>

        {/* Sound toggle - right */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMuted(!isMuted)}
          className="text-foreground/70 hover:text-foreground"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </Button>
      </div>
    </header>
  );
};
