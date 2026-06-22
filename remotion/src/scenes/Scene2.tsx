import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../theme";
import { anton, grotesk } from "../fonts";

// Scene 2 — "Hear it. Name it." with audio wave (4-10s)
export const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hearY = interpolate(spring({ frame, fps, config: { damping: 14 } }), [0, 1], [80, 0]);
  const nameY = interpolate(spring({ frame: frame - 35, fps, config: { damping: 14 } }), [0, 1], [80, 0]);
  const hearO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const nameO = interpolate(frame, [35, 50], [0, 1], { extrapolateRight: "clamp" });

  // waveform
  const bars = new Array(60).fill(0);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 60 }}>
      <div style={{
        opacity: hearO,
        transform: `translateY(${hearY}px)`,
        fontFamily: anton,
        fontSize: 200,
        color: COLORS.cream,
        lineHeight: 0.9,
        letterSpacing: -3,
        textAlign: "center",
      }}>
        HEAR IT.
      </div>

      {/* waveform */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 6, marginTop: 60, marginBottom: 60, height: 140,
      }}>
        {bars.map((_, i) => {
          const h = 12 + Math.abs(Math.sin((frame + i * 5) / 5)) * (50 + Math.sin(i) * 60);
          return <div key={i} style={{
            width: 8, height: h,
            background: i % 3 === 0 ? COLORS.orange : COLORS.gold,
            borderRadius: 6,
          }} />;
        })}
      </div>

      <div style={{
        opacity: nameO,
        transform: `translateY(${nameY}px)`,
        fontFamily: anton,
        fontSize: 200,
        color: COLORS.gold,
        lineHeight: 0.9,
        letterSpacing: -3,
        textAlign: "center",
        textShadow: `0 0 50px ${COLORS.gold}77`,
      }}>
        NAME IT.
      </div>

      <div style={{
        marginTop: 50,
        opacity: interpolate(frame, [70, 95], [0, 1], { extrapolateRight: "clamp" }),
        fontFamily: grotesk,
        fontSize: 32,
        color: COLORS.cream,
        opacity: interpolate(frame, [70, 95], [0, 0.85], { extrapolateRight: "clamp" }),
        letterSpacing: 6,
        textTransform: "uppercase",
      }}>
        Afrobeats · Amapiano · Highlife
      </div>
    </AbsoluteFill>
  );
};
