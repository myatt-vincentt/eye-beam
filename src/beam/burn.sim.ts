// The burn, step by step: the same heat → char → cool rules the GPU burn
// field runs (BurnField.tsx), on a coarse grid. The grid tells the sound how
// fresh the burn under the beam is (fresh picture crackles loudest) and gives
// the dev readout its heat numbers. Pure, tested in burn.sim.test.ts.
//
// Positions are in "aspect space": x = uv.x × aspect, y = uv.y (screen
// heights), so distances are round on any screen shape.

import { BURN } from "./config";

export type BurnGrid = {
  w: number;
  h: number;
  aspect: number;
  heat: Float32Array;
  char: Float32Array;
};

export const burnGrid = (aspect: number, rows = 36): BurnGrid => {
  const h = rows;
  const w = Math.max(8, Math.round(rows * aspect));
  return {
    w,
    h,
    aspect,
    heat: new Float32Array(w * h),
    char: new Float32Array(w * h),
  };
};

/** Distance from p to the segment a–b (all in aspect space). */
export const segmentDistance = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 > 1e-12
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2))
      : 0;
  const ex = px - (ax + dx * t);
  const ey = py - (ay + dy * t);
  return Math.sqrt(ex * ex + ey * ey);
};

/** The impact's heat falloff (1 at the centre). Matches the GPU shader. */
export const falloff = (d: number, radius: number) =>
  Math.exp(-((d / radius) ** 2) * 2.5) +
  0.07 * Math.exp(-((d / (radius * 2.2)) ** 2));

/** One cell's heat and char after `dt` with `add` heat per second arriving. */
export const stepCell = (
  heat: number,
  char: number,
  add: number,
  dt: number,
) => {
  let h = Math.min(BURN.heatMax, heat + add * dt);
  let c = Math.min(
    1,
    char + BURN.charRate * dt * Math.max(h - BURN.charFrom, 0),
  );
  h *= Math.exp(-dt / BURN.cool);
  const cooled = 1 - Math.min(1, Math.max(0, h / BURN.fadeBelow));
  c = Math.max(0, c - (dt / BURN.charFade) * cooled);
  return [h, c] as const;
};

export type BurnStats = {
  /** Hottest cell, and the share of the screen hot (> 0.5) or charred (> 0.3). */
  maxHeat: number;
  hot: number;
  charred: number;
  /** How fresh the picture under the beam was this step (0 … 1). */
  fresh: number;
};

/**
 * One step of the grid. `from` → `to` is the impact's path this frame
 * (aspect space), `power` 0 … 1 the beam (0 = not burning).
 */
export const stepBurnGrid = (
  g: BurnGrid,
  dt: number,
  from: readonly [number, number],
  to: readonly [number, number],
  power: number,
  radius: number,
  out: BurnStats,
): BurnStats => {
  let maxHeat = 0;
  let hot = 0;
  let charred = 0;
  let freshSum = 0;
  let weight = 0;
  for (let j = 0; j < g.h; j += 1) {
    const py = (j + 0.5) / g.h;
    for (let i = 0; i < g.w; i += 1) {
      const k = j * g.w + i;
      const px = ((i + 0.5) / g.w) * g.aspect;
      let add = 0;
      if (power > 0) {
        const f = falloff(
          segmentDistance(px, py, from[0], from[1], to[0], to[1]),
          radius,
        );
        add = BURN.heatRate * power * f;
        if (f > 0.05) {
          freshSum += f * (1 - g.char[k]);
          weight += f;
        }
      }
      const [h, c] = stepCell(g.heat[k], g.char[k], add, dt);
      g.heat[k] = h;
      g.char[k] = c;
      if (h > maxHeat) maxHeat = h;
      if (h > 0.5) hot += 1;
      if (c > 0.3) charred += 1;
    }
  }
  const n = g.w * g.h;
  out.maxHeat = maxHeat;
  out.hot = hot / n;
  out.charred = charred / n;
  out.fresh = weight > 0 ? freshSum / weight : 0;
  return out;
};
