import { useRef } from "react";
import { motion, type Variants } from "framer-motion";
import { Music, Mic2 } from "lucide-react";
import type { Playlist } from "@/lib/playlists";
import { cn } from "@/lib/utils";

const DOUBLE_TAP_MS = 350;

interface PlaylistCardProps {
  playlist: Playlist;
  imageUrl?: string;
  isSelected: boolean;
  onClick: () => void;
  /** Fires on a second tap/click within DOUBLE_TAP_MS — lets a caller skip
   *  straight to "start" without scrolling to a separate button. */
  onDoubleClick?: () => void;
  featured?: boolean;
  variants?: Variants;
  className?: string;
}

export const PlaylistCard = ({
  playlist,
  imageUrl,
  isSelected,
  onClick,
  onDoubleClick,
  featured = false,
  variants,
  className,
}: PlaylistCardProps) => {
  const displayImage = imageUrl || playlist.image;
  const lastTapRef = useRef(0);

  // Native dblclick is unreliable on touch (mobile Safari in particular
  // doesn't fire it from two taps), so double-tap is detected manually off
  // the same click/tap event every browser fires consistently.
  const handleTap = () => {
    onClick();
    const now = Date.now();
    if (onDoubleClick && now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      onDoubleClick();
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <motion.button
      onClick={handleTap}
      variants={variants}
      className={cn(
        "relative w-full overflow-hidden rounded-xl border-2 transition-all duration-300",
        isSelected ? "border-primary ring-2 ring-primary/50" : "border-border/50 hover:border-primary/50",
        className,
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Playlist Image */}
      <div className="aspect-square relative">
        {displayImage ? (
          <img 
            src={displayImage} 
            alt={playlist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Music className="w-12 h-12 text-primary/50" />
          </div>
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Artist sub-category badge */}
        {playlist.isArtist && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-kente-green text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shadow-sm">
            <Mic2 className="w-3 h-3" />
            Artist
          </div>
        )}

        {/* Text content */}
        <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
          <h4 className={cn("font-display tracking-wide text-white truncate", featured ? "text-lg md:text-xl" : "text-sm")}>
            {playlist.name}
          </h4>
          <p className={cn("text-white/70 truncate", featured ? "text-sm" : "text-xs")}>
            {playlist.description}
          </p>
        </div>

        {/* Selected indicator */}
        {isSelected && (
          <motion.div
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        )}
      </div>
    </motion.button>
  );
};
