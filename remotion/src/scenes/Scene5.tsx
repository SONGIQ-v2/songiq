import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../theme";
import { anton, grotesk } from "../fonts";

// Scene 5 — CTA (6s)
export const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logo = spring({ frame, fps, config: { damping: 12 } });
  const url = spring({ frame: frame - 20, fps, config: { damping: 14 } });
  const play = spring({ frame: frame - 40, fps, config: { damping: 10, stiffness: 130 } });
  const pulse = 1 + Math.sin(frame / 5) * 0.05;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{
        fontFamily: anton,
        fontSize: 260,
        lineHeight: 0.9,
        color: COLORS.cream,
        letterSpacing: -3,
        textAlign: "center",
        transform: `scale(${logo})`,
        textShadow: `0 0 60px ${COLORS.gold}99`,
      }}>
        SONG<span style={{ color: COLORS.gold }}>IQ</span>
      </div>

      <div style={{
        marginTop: 50,
        fontFamily: grotesk,
        fontSize: 42,
        fontWeight: 700,
        color: COLORS.cream,
        textAlign: "center",
        opacity: url,
        letterSpacing: 1,
      }}>
        Play free in your browser
      </div>

      <div style={{
        marginTop: 60,
        padding: "28px 80px",
        background: COLORS.gold,
        color: COLORS.ink,
        fontFamily: anton,
        fontSize: 88,
        letterSpacing: 2,
        borderRadius: 100,
        transform: `scale(${play * pulse})`,
        boxShadow: `0 0 80px ${COLORS.gold}AA`,
      }}>
        SONGIQ.XYZ
      </div>

      <div style={{
        marginTop: 60,
        fontFamily: grotesk,
        fontSize: 28,
        color: COLORS.cream,
        opacity: interpolate(frame, [60, 90], [0, 0.7], { extrapolateRight: "clamp" }),
        letterSpacing: 8,
        textTransform: "uppercase",
      }}>
        How well do you know African music?
      </div>
    </AbsoluteFill>
  );
};
