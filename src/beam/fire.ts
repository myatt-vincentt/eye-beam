// When the beams fire, from the face's blendshapes. Pure (no React, no
// three), so it is tested on its own (fire.test.ts).
//
// Every face rests differently, so the first FIRE.calibrate seconds with a
// face in view learn your resting face, and the stare is scored by how far
// it has moved from there: 1 = clearly wide eyes or raised brows. Holding a
// score of 1 for a moment starts the charge; the beams then keep firing
// while the score stays above FIRE.exit, and stop a moment after it drops.
// The resting face keeps learning, only from relaxed readings, so a held
// stare never becomes the new rest.

import { FIRE } from "./config";

export type Blendshapes = Readonly<Record<string, number | undefined>>;

export type FirePhase = "idle" | "charging" | "firing";

type Pair = { eyes: number; brows: number };

/** The two raw readings: both eyes wide, and the brows raised. */
export const readings = (b: Blendshapes): Pair => ({
  // The less-wide eye, so one eye catching the light doesn't fire.
  eyes: Math.min(b.eyeWideLeft ?? 0, b.eyeWideRight ?? 0),
  brows: Math.max(
    b.browInnerUp ?? 0,
    ((b.browOuterUpLeft ?? 0) + (b.browOuterUpRight ?? 0)) / 2,
  ),
});

export type FireState = {
  /** Resting readings (null until learned). */
  base: Pair | null;
  sum: Pair;
  seen: number;
  /** The stare is showing (after hold and release). */
  staring: boolean;
  /** When the score crossed in or out (−1 = not counting). */
  since: number;
  phase: FirePhase;
  /** When the phase started (s). */
  phaseAt: number;
  /** Fires started by the face (not the dev key). */
  fires: number;
  score: number;
  lastFace: number;
  t: number;
};

export const fireState = (): FireState => ({
  base: null,
  sum: { eyes: 0, brows: 0 },
  seen: 0,
  staring: false,
  since: -1,
  phase: "idle",
  phaseAt: 0,
  fires: 0,
  score: 0,
  lastFace: -Infinity,
  t: 0,
});

/** How far the face is from rest (1 = clearly staring). */
export const stareScore = (r: Pair, base: Pair) =>
  Math.max(
    (r.eyes - base.eyes) / FIRE.span.eyes,
    (r.brows - base.brows) / FIRE.span.brows,
    0,
  );

/**
 * One step. `face` is the blendshapes (null when no face is seen); `held`
 * is the dev key standing in for a stare.
 */
export const stepFire = (
  prev: FireState,
  t: number,
  face: Blendshapes | null,
  held = false,
): FireState => {
  const dt = Math.min(Math.max(t - prev.t, 0), 0.1);
  const s: FireState = { ...prev, t };

  if (!face) {
    if (t - s.lastFace > FIRE.faceLost) {
      s.staring = false;
      s.since = -1;
      s.score = 0;
    }
  } else {
    s.lastFace = t;
    const r = readings(face);
    if (!s.base) {
      // Learning the resting face.
      s.sum = {
        eyes: s.sum.eyes + r.eyes * dt,
        brows: s.sum.brows + r.brows * dt,
      };
      s.seen += dt;
      if (s.seen >= FIRE.calibrate)
        s.base = {
          eyes: Math.min(s.sum.eyes / s.seen, FIRE.restMax.eyes),
          brows: Math.min(s.sum.brows / s.seen, FIRE.restMax.brows),
        };
    } else {
      s.score = stareScore(r, s.base);
      // Hysteresis: in at `enter` held for `hold`, out below `exit` for `release`.
      const crossing = s.staring ? s.score < FIRE.exit : s.score >= FIRE.enter;
      if (!crossing) s.since = -1;
      else {
        if (s.since < 0) s.since = t;
        if (t - s.since >= (s.staring ? FIRE.release : FIRE.hold)) {
          s.staring = !s.staring;
          s.since = -1;
        }
      }
      // Keep learning the resting face, only from relaxed readings.
      if (!s.staring && s.score < 0.5) {
        const k = dt / FIRE.adapt;
        s.base = {
          eyes: Math.min(
            s.base.eyes + (r.eyes - s.base.eyes) * k,
            FIRE.restMax.eyes,
          ),
          brows: Math.min(
            s.base.brows + (r.brows - s.base.brows) * k,
            FIRE.restMax.brows,
          ),
        };
      }
    }
  }

  const on = s.staring || held;
  if (!on) {
    if (s.phase !== "idle") {
      s.phase = "idle";
      s.phaseAt = t;
    }
  } else if (s.phase === "idle") {
    s.phase = "charging";
    s.phaseAt = t;
    if (s.staring) s.fires += 1;
  } else if (s.phase === "charging" && t - s.phaseAt >= FIRE.charge) {
    s.phase = "firing";
    s.phaseAt = t;
  }
  return s;
};
