import { describe, expect, it } from "vitest";

import { EYES } from "./config";
import { oneEuro2 } from "./oneEuro";

const DT = 1 / 30;

describe("one euro (beam origins)", () => {
  it("starts exactly on the first reading", () => {
    const f = oneEuro2(EYES.filter);
    expect(f.next(0.4, 0.6, DT)).toEqual([0.4, 0.6]);
  });

  it("steadies a still reading's shake", () => {
    const f = oneEuro2(EYES.filter);
    let maxDev = 0;
    for (let i = 0; i < 90; i += 1) {
      const jitter = (i % 2 ? 1 : -1) * 0.002;
      const [x] = f.next(0.5 + jitter, 0.5, DT);
      if (i > 10) maxDev = Math.max(maxDev, Math.abs(x - 0.5));
    }
    expect(maxDev).toBeLessThan(0.0015);
  });

  it("keeps up with a fast head shake (a tiny lag only)", () => {
    const f = oneEuro2(EYES.filter);
    let worst = 0;
    for (let i = 0; i < 90; i += 1) {
      // ±0.1 of the screen at 2 Hz: a quick shake.
      const x = 0.5 + 0.1 * Math.sin(2 * Math.PI * 2 * i * DT);
      const [fx] = f.next(x, 0.5, DT);
      if (i > 10) worst = Math.max(worst, Math.abs(fx - x));
    }
    expect(worst).toBeLessThan(0.003);
  });
});
