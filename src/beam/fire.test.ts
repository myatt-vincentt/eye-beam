import { describe, expect, it } from "vitest";

import { FIRE } from "./config";
import { fireState, stepFire, type Blendshapes, type FireState } from "./fire";

const FPS = 30;

/** Run `face(t)` for `seconds` from `state`, one step per frame. */
const run = (
  state: FireState,
  seconds: number,
  face: (t: number) => Blendshapes | null,
  held = false,
) => {
  let s = state;
  const start = s.t;
  const phases: string[] = [];
  for (let i = 1; i <= seconds * FPS; i += 1) {
    const t = start + i / FPS;
    s = stepFire(s, t, face(t), held);
    phases.push(s.phase);
  }
  return { s, phases };
};

const rest: Blendshapes = {
  eyeWideLeft: 0.04,
  eyeWideRight: 0.05,
  browInnerUp: 0.12,
  browOuterUpLeft: 0.05,
  browOuterUpRight: 0.06,
};
const stare: Blendshapes = { ...rest, eyeWideLeft: 0.4, eyeWideRight: 0.42 };
const brows: Blendshapes = { ...rest, browInnerUp: 0.7 };

const calibrated = () => run(fireState(), FIRE.calibrate + 0.2, () => rest).s;

describe("fire detection", () => {
  it("learns the resting face first and does not fire while learning", () => {
    const { s, phases } = run(fireState(), FIRE.calibrate + 0.2, () => stare);
    expect(phases.every((p) => p === "idle")).toBe(true);
    // A face that was already staring is capped at the rest maximum.
    expect(s.base?.eyes).toBeLessThanOrEqual(FIRE.restMax.eyes);
  });

  it("stays idle on a relaxed face with small wobbles", () => {
    const { phases } = run(calibrated(), 10, (t) => ({
      ...rest,
      eyeWideLeft: 0.04 + 0.05 * Math.sin(t * 7),
      eyeWideRight: 0.05 + 0.05 * Math.sin(t * 5),
      browInnerUp: 0.12 + 0.12 * Math.sin(t * 3),
    }));
    expect(phases.every((p) => p === "idle")).toBe(true);
  });

  it("ignores a stare shorter than the hold", () => {
    const { phases } = run(calibrated(), 1, (t) =>
      t % 1 < FIRE.hold * 0.5 ? stare : rest,
    );
    expect(phases.includes("charging")).toBe(false);
  });

  it("charges, then fires while the stare is held, then stops", () => {
    const s0 = calibrated();
    const held = run(s0, 1.5, () => stare);
    const firstCharge = held.phases.indexOf("charging");
    const firstFire = held.phases.indexOf("firing");
    expect(firstCharge).toBeGreaterThan(0);
    // The charge lasts FIRE.charge.
    expect((firstFire - firstCharge) / FPS).toBeCloseTo(FIRE.charge, 1);
    expect(held.s.phase).toBe("firing");
    expect(held.s.fires).toBe(1);
    const relaxed = run(held.s, 1, () => rest);
    expect(relaxed.s.phase).toBe("idle");
  });

  it("raised brows fire too", () => {
    const { s } = run(calibrated(), 1, () => brows);
    expect(s.phase).toBe("firing");
  });

  it("keeps firing through a dip above the keep score (hysteresis)", () => {
    const { s } = run(calibrated(), 1, () => stare);
    const half: Blendshapes = { ...rest, eyeWideLeft: 0.2, eyeWideRight: 0.21 };
    const dip = run(s, 1, () => half);
    expect(dip.phases.every((p) => p === "firing")).toBe(true);
  });

  it("a held stare never becomes the new resting face", () => {
    const { s } = run(calibrated(), 20, () => stare);
    expect(s.phase).toBe("firing");
    expect(s.base?.eyes).toBeLessThan(0.1);
  });

  it("stops when the face is lost", () => {
    const { s } = run(calibrated(), 1, () => stare);
    const lost = run(s, FIRE.faceLost + 0.2, () => null);
    expect(lost.s.phase).toBe("idle");
  });

  it("the dev key fires without a face", () => {
    const { s } = run(fireState(), 0.5, () => null, true);
    expect(s.phase).toBe("firing");
    expect(s.fires).toBe(0);
  });
});
