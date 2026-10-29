import { describe, expect, it } from "vitest";

import {
  burnGrid,
  segmentDistance,
  stepBurnGrid,
  stepCell,
  type BurnStats,
} from "./burn.sim";
import { BURN } from "./config";

const stats = (): BurnStats => ({ maxHeat: 0, hot: 0, charred: 0, fresh: 0 });
const DT = 1 / 30;

describe("burn", () => {
  it("measures distance to a segment", () => {
    expect(segmentDistance(0.5, 1, 0, 0, 1, 0)).toBeCloseTo(1);
    expect(segmentDistance(2, 0, 0, 0, 1, 0)).toBeCloseTo(1);
    expect(segmentDistance(0, 0, 0, 0, 0, 0)).toBe(0);
  });

  it("a held beam heats to white-hot and chars", () => {
    let h = 0;
    let c = 0;
    for (let i = 0; i < 30; i += 1) [h, c] = stepCell(h, c, BURN.heatRate, DT);
    expect(h).toBeGreaterThan(1.2);
    expect(c).toBeGreaterThan(0.9);
  });

  it("cools: embers first, then the char fades back within about 10 s", () => {
    let h = 1.8;
    let c = 1;
    const at: Record<number, [number, number]> = {};
    for (let i = 1; i <= 12 * 30; i += 1) {
      [h, c] = stepCell(h, c, 0, DT);
      if (i % 30 === 0) at[i / 30] = [h, c];
    }
    // Embers glow for a moment and are mostly gone by 3 s…
    expect(at[1][0]).toBeGreaterThan(0.3);
    expect(at[3][0]).toBeLessThan(0.15);
    // …while the char is still mostly there, then fades.
    expect(at[3][1]).toBeGreaterThan(0.6);
    expect(at[6][1]).toBeLessThan(at[3][1]);
    expect(at[10][1]).toBeLessThan(0.05);
  });

  it("a sweep leaves a continuous trail", () => {
    const g = burnGrid(9 / 16);
    const out = stats();
    const a = 9 / 16;
    // Sweep across the screen in one second.
    let from: [number, number] = [0.1 * a, 0.5];
    for (let i = 1; i <= 30; i += 1) {
      const to: [number, number] = [(0.1 + (0.8 * i) / 30) * a, 0.5];
      stepBurnGrid(g, DT, from, to, 1, BURN.radius, out);
      from = to;
    }
    // A moment later, the heat left behind has charred it…
    for (let i = 0; i < 15; i += 1)
      stepBurnGrid(g, DT, from, from, 0, BURN.radius, out);
    // …every column the sweep crossed, along its middle row.
    const row = Math.floor(g.h / 2);
    const cols = [];
    for (let i = 0; i < g.w; i += 1) {
      const x = (i + 0.5) / g.w;
      if (x > 0.15 && x < 0.85) cols.push(g.char[row * g.w + i]);
    }
    expect(Math.min(...cols)).toBeGreaterThan(0.2);
    expect(out.charred).toBeGreaterThan(0);
  });

  it("fresh picture reads fresh, burnt picture does not", () => {
    const g = burnGrid(9 / 16);
    const out = stats();
    const at: [number, number] = [0.28, 0.5];
    stepBurnGrid(g, DT, at, at, 1, BURN.radius, out);
    expect(out.fresh).toBeGreaterThan(0.9);
    for (let i = 0; i < 60; i += 1)
      stepBurnGrid(g, DT, at, at, 1, BURN.radius, out);
    expect(out.fresh).toBeLessThan(0.3);
  });
});
