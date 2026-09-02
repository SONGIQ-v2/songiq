import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionQuality } from "@/hooks/useConnectionQuality";

const CONFIG: Record<ConnectionQuality, { label: string; color: string; icon: typeof Wifi }> = {
  good: { label: "Strong", color: "text-kente-green", icon: Wifi },
  fair: { label: "Weak", color: "text-yellow-400", icon: Wifi },
  poor: { label: "Poor", color: "text-red-400", icon: WifiOff },
  unknown: { label: "", color: "text-muted-foreground", icon: Wifi },
};

export function ConnectionBadge({ quality }: { quality: ConnectionQuality }) {
  if (quality === "unknown") return null;
  const { label, color, icon: Icon } = CONFIG[quality];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide border",
        quality === "good" && "bg-kente-green/10 border-kente-green/30",
        quality === "fair" && "bg-yellow-400/10 border-yellow-400/30",
        quality === "poor" && "bg-red-400/10 border-red-400/30",
        color
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </div>
  );
}
