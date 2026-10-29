// What every part reads each frame, written without re-renders: the face,
// the fire state, where the beams start and hit, and how the burn is doing.
// Screen positions are uv (0 … 1, y up).

import type { BurnStats } from "./burn.sim";
import { fireState, type Blendshapes, type FireState } from "./fire";
import type { Vec2 } from "./aim";

export const live = {
  /** A face is in view, and the eased readings from it. */
  tracked: false,
  mirrored: true,
  blendshapes: {} as Blendshapes,
  yaw: 0,
  pitch: 0,
  /** Your usual head pose: the aim measures turns from here. */
  poseRest: null as { yaw: number; pitch: number } | null,
  /** The two eye centres (the person's own left and right). */
  eyeL: [0.45, 0.62] as Vec2,
  eyeR: [0.55, 0.62] as Vec2,
  /** The same eye centres straight from the latest face reading (dev check). */
  rawEyeL: [0.45, 0.62] as Vec2,
  rawEyeR: [0.55, 0.62] as Vec2,
  /** Eye-to-eye distance in screen heights (the face's size on screen). */
  eyeGap: 0.14,

  fire: fireState() as FireState,
  /** Eye glow while charging (0 … 1), beam strength (0 … 1), beam reach (0 … 1). */
  charge: 0,
  power: 0,
  reach: 0,
  /** Where the head points, and the impact the beams drag towards it. */
  aim: [0.5, 0.36] as Vec2,
  target: [0.5, 0.36] as Vec2,
  /** The impact's path this frame (aspect space), and whether it burns. */
  burnFrom: [0, 0] as Vec2,
  burnTo: [0, 0] as Vec2,
  burning: false,
  /** Seconds since the start, when the beams last started (−1 never). */
  firedAt: -1,
  /** The beams have fired at least once (the hint leaves for good). */
  firedOnce: false,

  /** Burn numbers from the coarse grid (burn.sim.ts). */
  heat: { maxHeat: 0, hot: 0, charred: 0, fresh: 0 } as BurnStats,

  /** Sound: on once tapped, and its output level. */
  audio: { on: false, rms: 0, peak: 0 },

  /** Dev only: the F key, arrow-key nudges, and a fixed aim for scripted tests. */
  dev: {
    fire: false,
    /** Added to the brow readings: a pretend brow raise through the real detector. */
    brows: 0,
    nudge: [0, 0] as Vec2,
    aim: null as Vec2 | null,
  },
};
