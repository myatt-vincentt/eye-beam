// A One Euro filter for a 2D point: steadies the tiny shake of a still
// reading, and lets fast motion straight through (its cutoff rises with
// speed), so the beam origins never trail the eyes. Pure, tested in
// oneEuro.test.ts.

export type OneEuroOptions = {
  /** Cutoff (Hz) when still: lower = steadier, more lag on slow moves. */
  minCutoff: number;
  /** How fast the cutoff rises with speed (per unit of speed). */
  beta: number;
  /** Cutoff (Hz) for the speed estimate. */
  dCutoff: number;
};

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export type OneEuro2 = {
  /** Filter a new sample `dt` seconds after the last; returns the filtered point. */
  next: (x: number, y: number, dt: number) => readonly [number, number];
  /** The filtered point, and the speed estimate (units per second). */
  point: readonly [number, number];
  velocity: readonly [number, number];
  reset: () => void;
};

export const oneEuro2 = (o: OneEuroOptions): OneEuro2 => {
  let has = false;
  const p: [number, number] = [0, 0];
  const v: [number, number] = [0, 0];
  return {
    next(x, y, dt) {
      if (!has || dt <= 0) {
        has = true;
        p[0] = x;
        p[1] = y;
        v[0] = 0;
        v[1] = 0;
        return p;
      }
      const ad = alpha(o.dCutoff, dt);
      v[0] += ((x - p[0]) / dt - v[0]) * ad;
      v[1] += ((y - p[1]) / dt - v[1]) * ad;
      const cutoff = o.minCutoff + o.beta * Math.hypot(v[0], v[1]);
      const a = alpha(cutoff, dt);
      p[0] += (x - p[0]) * a;
      p[1] += (y - p[1]) * a;
      return p;
    },
    point: p,
    velocity: v,
    reset() {
      has = false;
    },
  };
};
