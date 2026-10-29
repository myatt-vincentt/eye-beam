// Where the beams hit: the head's direction projected forward onto the
// screen. Looking straight puts the target in front of you, a little below
// and towards the centre; turning sweeps it across the screen. Pure, so it
// is tested on its own (aim.test.ts).
//
// Screen uv here: 0 … 1 across, 0 at the bottom, y up.

import { AIM } from "./config";

export type Vec2 = [number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/* eslint-disable no-param-reassign -- writes into the caller's tuple */
/**
 * The target for a head turn. `eyes` is the point between the eyes (uv),
 * `yaw` / `pitch` the head turn in radians (+yaw = the person's own left,
 * +pitch = up), `leftSign` which way the person's left is on screen (+1 to
 * the right, −1 to the left on the mirrored selfie view).
 */
export const aimTarget = (
  eyes: Readonly<Vec2>,
  yaw: number,
  pitch: number,
  leftSign: number,
  out: Vec2 = [0, 0],
): Vec2 => {
  const lim = 1.2; // radians: past this a head turn is a tracking glitch
  const x0 = AIM.rest[0] + (eyes[0] - AIM.rest[0]) * AIM.follow;
  const y0 = AIM.rest[1] + (eyes[1] - AIM.below - AIM.rest[1]) * AIM.follow;
  const x = x0 + AIM.gain[0] * Math.tan(clamp(yaw, -lim, lim)) * leftSign;
  const y = y0 + AIM.gain[1] * Math.tan(clamp(pitch, -lim, lim));
  out[0] = clamp(x, AIM.margin, 1 - AIM.margin);
  out[1] = clamp(y, AIM.margin, 1 - AIM.margin);
  return out;
};
/* eslint-enable no-param-reassign */
