import { motion } from "framer-motion";
import { Music } from "lucide-react";
import type { Playlist } from "@/lib/playlists";

interface PlaylistCardProps {
  playlist: Playlist;
  imageUrl?: string;
  isSelected: boolean;
  onClick: () => void;
}

export const PlaylistCard = ({
  playlist,
  imageUrl,
  isSelected,
  onClick,
}: PlaylistCardProps) => {
  const displayImage = imageUrl || playlist.image;

  return (
    <motion.button
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
        isSelected 
          ? "border-primary ring-2 ring-primary/50" 
          : "border-border/50 hover:border-primary/50"
      }`}
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
        
        {/* Text content */}
        <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
          <h4 className="font-display text-sm uppercase tracking-wide text-white truncate">
            {playlist.name}
          </h4>
          <p className="text-xs text-white/70 truncate">
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
