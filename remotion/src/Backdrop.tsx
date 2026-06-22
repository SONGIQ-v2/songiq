import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, random } from "remotion";
import { COLORS } from "./theme";

// Persistent animated starfield + gradient backdrop (whole video)
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const stars = new Array(80).fill(0).map((_, i) => {
    const sx = random(`x${i}`) * width;
    const sy = random(`y${i}`) * height;
    const size = 1 + random(`s${i}`) * 2.5;
    const twinkle = 0.3 + 0.7 * Math.abs(Math.sin((frame + i * 7) / 20));
    return { sx, sy, size, twinkle, i };
  });

  const driftX = Math.sin(frame / 90) * 30;
  const driftY = Math.cos(frame / 110) * 30;

  return (
    <AbsoluteFill style={{
      background: `radial-gradient(ellipse at 30% 20%, #1A1F4E 0%, ${COLORS.bg} 45%, ${COLORS.bgDeep} 100%)`,
    }}>
      {/* gold aurora glow */}
      <div style={{
        position: "absolute",
        width: 1400, height: 1400,
        left: -300 + driftX,
        top: -400 + driftY,
        background: `radial-gradient(circle, ${COLORS.gold}22 0%, transparent 60%)`,
        filter: "blur(40px)",
      }} />
      <div style={{
        position: "absolute",
        width: 1200, height: 1200,
        right: -300 - driftX,
        bottom: -300 - driftY,
        background: `radial-gradient(circle, ${COLORS.orange}22 0%, transparent 60%)`,
        filter: "blur(40px)",
      }} />
      {/* stars */}
      {stars.map(s => (
        <div key={s.i} style={{
          position: "absolute",
          left: s.sx, top: s.sy,
          width: s.size, height: s.size,
          borderRadius: "50%",
          background: COLORS.cream,
          opacity: s.twinkle * 0.7,
          boxShadow: `0 0 ${s.size * 2}px ${COLORS.gold}`,
        }} />
      ))}
    </AbsoluteFill>
  );
};
