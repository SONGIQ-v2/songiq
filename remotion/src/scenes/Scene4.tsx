import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../theme";
import { anton, grotesk } from "../fonts";

// Scene 4 — MULTIPLAYER (7s)
export const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelS = spring({ frame, fps, config: { damping: 14 } });
  const titleS = spring({ frame: frame - 12, fps, config: { damping: 14 } });

  const players = [
    { name: "ADA", score: 820, color: COLORS.gold, avatar: "🎧" },
    { name: "KOJO", score: 760, color: COLORS.orange, avatar: "🔥" },
    { name: "ZARA", score: 690, color: COLORS.magenta, avatar: "⭐" },
    { name: "TUNDE", score: 540, color: "#6BD4FF", avatar: "🎵" },
  ];

  return (
    <AbsoluteFill style={{ padding: 70, justifyContent: "center" }}>
      <div style={{
        fontFamily: grotesk,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: 8,
        color: COLORS.magenta,
        textTransform: "uppercase",
        opacity: labelS,
        transform: `translateX(${(1 - labelS) * 40}px)`,
        textAlign: "right",
      }}>
        Mode 02 ◆
      </div>

      <div style={{
        fontFamily: anton,
        fontSize: 220,
        lineHeight: 0.88,
        color: COLORS.cream,
        letterSpacing: -4,
        marginTop: 10,
        textAlign: "right",
        opacity: titleS,
        transform: `translateX(${(1 - titleS) * 40}px)`,
      }}>
        PLAY<br/>
        <span style={{ color: COLORS.orange }}>TOGETHER.</span>
      </div>

      <div style={{
        marginTop: 50,
        background: "rgba(255,255,255,0.06)",
        border: `1.5px solid ${COLORS.orange}55`,
        borderRadius: 32,
        padding: 32,
        boxShadow: `0 0 80px ${COLORS.orange}33`,
      }}>
        <div style={{
          fontFamily: grotesk,
          fontSize: 22,
          color: COLORS.orange,
          letterSpacing: 4,
          textTransform: "uppercase",
          marginBottom: 20,
          display: "flex", justifyContent: "space-between",
        }}>
          <span>◉ Live Lobby</span>
          <span style={{ color: COLORS.cream, opacity: 0.6 }}>ROUND 5/10</span>
        </div>

        {players.map((p, i) => {
          const enter = spring({ frame: frame - 30 - i * 8, fps, config: { damping: 16 } });
          // animated score
          const liveScore = Math.floor(p.score + Math.sin((frame + i * 10) / 15) * 5 + frame * 0.4);
          return (
            <div key={p.name} style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              padding: "18px 20px",
              marginBottom: 12,
              background: `linear-gradient(90deg, ${p.color}33 0%, transparent 80%)`,
              border: `1.5px solid ${p.color}66`,
              borderRadius: 18,
              transform: `translateX(${(1 - enter) * 100}px)`,
              opacity: enter,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                background: p.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 30,
              }}>{p.avatar}</div>
              <div style={{ flex: 1, fontFamily: grotesk, fontSize: 32, fontWeight: 700, color: COLORS.cream }}>
                {p.name}
              </div>
              <div style={{
                fontFamily: anton, fontSize: 44, color: p.color,
                textShadow: `0 0 20px ${p.color}88`,
              }}>{liveScore}</div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 36,
        textAlign: "center",
        fontFamily: grotesk,
        fontSize: 30,
        fontWeight: 700,
        color: COLORS.cream,
        letterSpacing: 3,
        opacity: interpolate(frame, [110, 140], [0, 0.9], { extrapolateRight: "clamp" }),
      }}>
        SHARE A LINK · BATTLE FRIENDS
      </div>
    </AbsoluteFill>
  );
};
