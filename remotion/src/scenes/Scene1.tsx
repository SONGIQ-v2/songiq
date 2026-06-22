import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion";
import { COLORS } from "../theme";
import { anton, grotesk } from "../fonts";

// Scene 1 — Hook: pulsing logo + headline (0-120f)
export const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const pulse = 1 + Math.sin(frame / 6) * 0.04;
  const tagOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });
  const tagY = interpolate(spring({ frame: frame - 25, fps, config: { damping: 18 } }), [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      {/* Eq bars behind logo */}
      <div style={{ position: "absolute", top: "30%", display: "flex", gap: 14, alignItems: "flex-end", height: 220 }}>
        {[0,1,2,3,4,5,6,7,8].map(i => {
          const h = 40 + Math.abs(Math.sin((frame + i * 8) / 4.5)) * 180;
          return <div key={i} style={{
            width: 18, height: h,
            background: i % 2 ? COLORS.gold : COLORS.orange,
            borderRadius: 10,
            opacity: 0.85,
            boxShadow: `0 0 24px ${i % 2 ? COLORS.gold : COLORS.orange}88`,
          }} />;
        })}
      </div>

      <div style={{
        transform: `scale(${logoScale * pulse})`,
        marginTop: 280,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: anton,
          fontSize: 220,
          lineHeight: 0.9,
          color: COLORS.cream,
          letterSpacing: -2,
          textShadow: `0 0 60px ${COLORS.gold}88`,
        }}>
          SONG<span style={{ color: COLORS.gold }}>IQ</span>
        </div>
      </div>

      <div style={{
        marginTop: 40,
        opacity: tagOpacity,
        transform: `translateY(${tagY}px)`,
        fontFamily: grotesk,
        fontSize: 44,
        fontWeight: 700,
        color: COLORS.cream,
        textAlign: "center",
        letterSpacing: 1,
      }}>
        The African Music<br/>Trivia Game
      </div>
    </AbsoluteFill>
  );
};
