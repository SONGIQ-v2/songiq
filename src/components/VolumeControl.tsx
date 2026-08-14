import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

interface VolumeControlProps {
  volume: number; // 0-1
  onVolumeChange: (volume: number) => void;
}

export function VolumeControl({ volume, onVolumeChange }: VolumeControlProps) {
  const isMuted = volume === 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isMuted ? "Unmute audio" : "Adjust volume"}
          className="text-foreground/60 hover:text-foreground"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-4">
        <Slider
          value={[Math.round(volume * 100)]}
          max={100}
          step={5}
          onValueChange={([v]) => onVolumeChange(v / 100)}
          aria-label="Volume"
        />
      </PopoverContent>
    </Popover>
  );
}
