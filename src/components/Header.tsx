import { Link } from "react-router-dom";
import { Menu, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import logoImg from "@/assets/songiq-logo.png";

export const Header = () => {
  const [isMuted, setIsMuted] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Menu button */}
        <Button variant="ghost" size="icon" className="text-foreground/70 hover:text-foreground">
          <Menu className="w-6 h-6" />
        </Button>

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img src={logoImg} alt="SongIQ" className="h-14 w-auto" />
        </Link>

        {/* Sound toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMuted(!isMuted)}
          className="text-foreground/70 hover:text-foreground"
        >
          {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </Button>
      </div>
    </header>
  );
};
