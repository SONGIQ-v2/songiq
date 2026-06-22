import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { slide } from "@remotion/transitions/slide";
import { Backdrop } from "./Backdrop";
import { Scene1 } from "./scenes/Scene1";
import { Scene2 } from "./scenes/Scene2";
import { Scene3 } from "./scenes/Scene3";
import { Scene4 } from "./scenes/Scene4";
import { Scene5 } from "./scenes/Scene5";

// Scene durations (frames). Transitions overlap, reducing total length.
// 120 + 180 + 210 + 210 + 180 = 900; minus 4 transitions * 18 = 828
// Composition is 900f so add padding -> bump scenes
// Recompute: 130+185+220+220+185 = 940 - 4*18 = 868. We want ~900. Tweak:
// 140+190+220+220+190 = 960 - 72 = 888. Close enough, set composition to 888 or pad.
// Simpler: set composition to match. Let's compute final total here and trust.

const TRANS = 18;

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Backdrop />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={140}>
          <Scene1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANS })}
        />
        <TransitionSeries.Sequence durationInFrames={195}>
          <Scene2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANS })}
        />
        <TransitionSeries.Sequence durationInFrames={225}>
          <Scene3 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANS })}
        />
        <TransitionSeries.Sequence durationInFrames={225}>
          <Scene4 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANS })}
        />
        <TransitionSeries.Sequence durationInFrames={200}>
          <Scene5 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
