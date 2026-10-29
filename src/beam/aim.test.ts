import { describe, expect, it } from "vitest";

import { aimTarget } from "./aim";
import { AIM } from "./config";

const EYES = [0.5, 0.62] as const;

describe("aim", () => {
  it("looking straight puts the target in front, below the eyes", () => {
    const [x, y] = aimTarget(EYES, 0, 0, -1);
    expect(x).toBeCloseTo(0.5, 3);
    expect(y).toBeLessThan(EYES[1]);
    expect(y).toBeGreaterThan(0.3);
  });

  it("turning to your own left sweeps left in the selfie view, right on a clip", () => {
    const [selfie] = aimTarget(EYES, 0.3, 0, -1);
    const [clip] = aimTarget(EYES, 0.3, 0, 1);
    expect(selfie).toBeLessThan(0.3);
    expect(clip).toBeGreaterThan(0.7);
  });

  it("looking up raises the target, looking down lowers it", () => {
    const [, up] = aimTarget(EYES, 0, 0.2, -1);
    const [, down] = aimTarget(EYES, 0, -0.2, -1);
    const [, straight] = aimTarget(EYES, 0, 0, -1);
    expect(up).toBeGreaterThan(straight);
    expect(down).toBeLessThan(straight);
  });

  it("follows you a little when you stand off to the side", () => {
    const [x] = aimTarget([0.25, 0.62], 0, 0, -1);
    expect(x).toBeLessThan(0.5);
    expect(x).toBeGreaterThan(0.25);
  });

  it("stays inside the screen", () => {
    const [x, y] = aimTarget(EYES, -1.5, 1.5, -1);
    expect(x).toBeLessThanOrEqual(1 - AIM.margin);
    expect(y).toBeLessThanOrEqual(1 - AIM.margin);
  });
});
