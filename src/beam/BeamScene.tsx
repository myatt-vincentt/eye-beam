// Eye Beam: widen your eyes or raise your brows and two beams of heat shoot
// from your eyes to where your head points, burning the picture like paper.
// Sweep your head and the burn trails after it; relax and the beams stop,
// the embers fade and the char slowly gives the live picture back.
import { Suspense } from "react";

import { Beams } from "./Beams";
import { BurnField } from "./BurnField";
import { Hint } from "./Hint";
import { Inputs } from "./Inputs";
import { Sound } from "./Sound";
import { Sparks } from "./Sparks";

export const BeamScene = () => (
  <>
    <Inputs />
    <BurnField />
    <Sparks />
    <Beams />
    <Sound />
    <Suspense fallback={null}>
      <Hint />
    </Suspense>
  </>
);
