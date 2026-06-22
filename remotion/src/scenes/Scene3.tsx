import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion";
import { COLORS } from "../theme";
import { anton, grotesk } from "../fonts";

// Scene 3 — SOLO MODE (7s)
export const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelS = spring({ frame, fps, config: { damping: 14 } });
  const titleS = spring({ frame: frame - 12, fps, config: { damping: 14 } });

  const choices = ["Burna Boy", "Wizkid", "Davido", "Tems"];
  const correctIdx = 1;

  return (
    <AbsoluteFill style={{ padding: 70, justifyContent: "center" }}>
      <div style={{
        fontFamily: grotesk,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: 8,
        color: COLORS.orange,
        textTransform: "uppercase",
        opacity: labelS,
        transform: `translateX(${(1 - labelS) * -40}px)`,
      }}>
        ◆ Mode 01
      </div>

      <div style={{
        fontFamily: anton,
        fontSize: 240,
        lineHeight: 0.88,
        color: COLORS.cream,
        letterSpacing: -4,
        marginTop: 10,
        opacity: titleS,
        transform: `translateX(${(1 - titleS) * -40}px)`,
      }}>
        SOLO<br/>
        <span style={{ color: COLORS.gold }}>PLAY.</span>
      </div>

      {/* Phone-like card showing question */}
      <div style={{
        marginTop: 60,
        background: "rgba(255,255,255,0.06)",
        border: `1.5px solid ${COLORS.gold}55`,
        borderRadius: 32,
        padding: 36,
        boxShadow: `0 0 80px ${COLORS.gold}33`,
        transform: `translateY(${interpolate(spring({ frame: frame - 25, fps, config: { damping: 16 } }), [0, 1], [80, 0])}px)`,
        opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        <div style={{
          fontFamily: grotesk,
          fontSize: 22,
          color: COLORS.gold,
          letterSpacing: 4,
          textTransform: "uppercase",
        }}>Guess the Artist</div>
        <div style={{
          fontFamily: anton,
          fontSize: 56,
          color: COLORS.cream,
          marginTop: 8,
          marginBottom: 28,
          letterSpacing: -1,
        }}>♪ Now Playing…</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {choices.map((c, i) => {
            const appear = interpolate(spring({ frame: frame - 50 - i * 6, fps, config: { damping: 18 } }), [0, 1], [30, 0]);
            const isCorrect = i === correctIdx;
            const reveal = frame > 130;
            const dim = reveal && !isCorrect;
            return (
              <div key={c} style={{
                background: reveal && isCorrect ? COLORS.gold : "rgba(255,255,255,0.05)",
                border: `2px solid ${reveal && isCorrect ? COLORS.gold : "rgba(245,235,211,0.25)"}`,
                color: reveal && isCorrect ? COLORS.ink : COLORS.cream,
                padding: "22px 18px",
                borderRadius: 18,
                fontFamily: grotesk,
                fontSize: 30,
                fontWeight: 700,
                textAlign: "center",
                transform: `translateY(${appear}px) scale(${reveal && isCorrect ? 1.05 : 1})`,
                opacity: dim ? 0.3 : 1,
                boxShadow: reveal && isCorrect ? `0 0 40px ${COLORS.gold}` : "none",
              }}>{c}</div>
            );
          })}
        </div>
      </div>

      {/* +100 points pop */}
      {frame > 145 && (
        <div style={{
          marginTop: 30,
          fontFamily: anton,
          fontSize: 100,
          color: COLORS.orange,
          textAlign: "center",
          letterSpacing: -1,
          transform: `scale(${spring({ frame: frame - 145, fps, config: { damping: 8 } })})`,
          textShadow: `0 0 50px ${COLORS.orange}`,
        }}>+100</div>
      )}
    </AbsoluteFill>
  );
};
