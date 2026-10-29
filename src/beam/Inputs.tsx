// Reads the face every frame and turns it into the beams: the eye centres
// (where the beams start), the head turn (where they hit), and the stare
// (when they fire, fire.ts). Then it moves the impact along, dragging a
// little behind the head, and steps the coarse burn grid for the sound.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { personLeftSign, personSide, XRModel } from "@vincentt-xr/sdk";
import {
  createFaceInfoTarget,
  getFaceInfo,
  useXRModelNode,
  type XRModelNodeFaceTracking,
} from "@vincentt-xr/sdk/low-level";
import { IRIS_LANDMARKS, useFaceInfo } from "@vincentt-xr/sdk/tracking";

import { aimTarget, type Vec2 } from "./aim";
import { burnGrid, stepBurnGrid, type BurnGrid } from "./burn.sim";
import { AIM, BEAM, BURN, EYES, FACE_FPS, FIRE } from "./config";
import { oneEuro2 } from "./oneEuro";
import { stepFire } from "./fire";
import { live } from "./live";

/** The blendshapes the stare is read from. */
const FACE_INPUTS = [
  "eyeWideLeft",
  "eyeWideRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
];
/** Per-second easing of the readings (higher = snappier, noisier). */
const FACE_EASE = 14;

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** The person's own left or right iris centre in a face reading (feed space). */
const irisAt = (
  face: {
    landmarks: ArrayLike<{ x: number; y: number }>;
    mirrored: boolean;
  } | null,
  side: "left" | "right",
) =>
  face
    ? face.landmarks[IRIS_LANDMARKS[personSide(side, face.mirrored)].center]
    : undefined;

/** The impact radius for the face's size on screen (aspect space). */
export const burnRadius = () =>
  BURN.radius * Math.min(1.35, Math.max(0.7, live.eyeGap / 0.14));

export const Inputs = () => {
  const face = useFaceInfo({ active: true, numFaces: 1, targetFps: FACE_FPS });
  // The face model's newest result, read every frame (the React reading
  // above arrives a frame or more later): the beams start exactly on it.
  const node = useXRModelNode<XRModelNodeFaceTracking>(XRModel.FACE_TRACKER);
  const latest = useMemo(() => createFaceInfoTarget(), []);
  const steady = useMemo(
    () => ({
      l: oneEuro2(EYES.filter),
      r: oneEuro2(EYES.filter),
      last: [NaN, NaN],
      at: 0,
    }),
    [],
  );
  const faceRef = useRef(face);
  faceRef.current = face;
  const smooth = useRef<Record<string, number>>({});
  const aim = useRef<Vec2>([0.5, 0.36]);
  const grid = useRef<BurnGrid | null>(null);
  const was = useRef(live.fire.phase);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const f = faceRef.current;
    const k = 1 - Math.exp(-FACE_EASE * dt);
    const kp = 1 - Math.exp(-AIM.poseEase * dt);
    live.tracked = !!f;
    if (f) {
      live.mirrored = f.mirrored;
      const out = smooth.current;
      FACE_INPUTS.forEach((name) => {
        const raised = name.startsWith("brow") ? live.dev.brows : 0;
        const v =
          ((f.blendshapes as Record<string, number | undefined>)[name] ?? 0) +
          raised;
        out[name] = (out[name] ?? v) + (v - (out[name] ?? v)) * k;
      });
      live.blendshapes = out;
      if (!live.poseRest) {
        live.yaw = f.pose.rotation.y;
        live.pitch = f.pose.rotation.x;
      }
      live.yaw += (f.pose.rotation.y - live.yaw) * kp;
      live.pitch += (f.pose.rotation.x - live.pitch) * kp;
      // Your usual pose keeps learning while the beams are off and you
      // aren't starting a stare.
      const clampTo = (v: number, m: number) => Math.min(m, Math.max(-m, v));
      if (!live.poseRest)
        live.poseRest = {
          yaw: clampTo(live.yaw, AIM.restMax.yaw),
          pitch: clampTo(live.pitch, AIM.restMax.pitch),
        };
      else if (
        live.fire.phase === "idle" &&
        live.power === 0 &&
        live.fire.score < 0.5
      ) {
        const kr = dt / AIM.restAdapt;
        const r = live.poseRest;
        r.yaw = clampTo(r.yaw + (live.yaw - r.yaw) * kr, AIM.restMax.yaw);
        r.pitch = clampTo(
          r.pitch + (live.pitch - r.pitch) * kr,
          AIM.restMax.pitch,
        );
      }
    }
    // The beam origins: the iris centres of the newest face result, as is.
    const now = node ? getFaceInfo(node, 0, latest) : null;
    const l = irisAt(now, "left");
    const rr = irisAt(now, "right");
    if (!l || !rr) {
      steady.l.reset();
      steady.r.reset();
    } else if (l.x !== steady.last[0] || l.y !== steady.last[1]) {
      // A new result: filter it (feed space, y down → screen uv, y up).
      const sdt = t - steady.at;
      steady.at = t;
      steady.last[0] = l.x;
      steady.last[1] = l.y;
      steady.l.next(l.x, 1 - l.y, sdt);
      steady.r.next(rr.x, 1 - rr.y, sdt);
    }
    if (l && rr) {
      // Move on along the eyes' motion: the picture on screen is a little
      // newer than the face result it was read from.
      const ahead = Math.min(0.1, t - steady.at + EYES.latency);
      [steady.l, steady.r].forEach((e, i) => {
        const out = i ? live.eyeR : live.eyeL;
        out[0] = e.point[0] + e.velocity[0] * ahead;
        out[1] = e.point[1] + e.velocity[1] * ahead;
      });
      const aspect = state.size.width / Math.max(1, state.size.height);
      live.eyeGap = Math.hypot(
        (live.eyeL[0] - live.eyeR[0]) * aspect,
        live.eyeL[1] - live.eyeR[1],
      );
    }
    // The React reading, for the dev check of the lock.
    const fa = irisAt(f, "left");
    const fb = irisAt(f, "right");
    if (fa && fb) {
      live.rawEyeL[0] = fa.x;
      live.rawEyeL[1] = 1 - fa.y;
      live.rawEyeR[0] = fb.x;
      live.rawEyeR[1] = 1 - fb.y;
    }

    // When to fire.
    live.fire = stepFire(
      live.fire,
      t,
      f ? live.blendshapes : null,
      live.dev.fire,
    );
    const { phase } = live.fire;
    if (phase !== was.current) {
      if (phase === "firing") {
        live.firedAt = t;
        live.firedOnce = true;
      }
      was.current = phase;
    }
    const age = t - live.fire.phaseAt;
    live.charge =
      phase === "charging"
        ? easeOut(age / FIRE.charge)
        : Math.max(0, live.charge - dt / 0.15);
    if (phase === "firing") {
      live.power = Math.min(1, live.power + dt / 0.06);
      live.reach = easeOut(age / BEAM.ignite);
    } else {
      live.power = Math.max(0, live.power - dt / BEAM.fadeOut);
      if (live.power === 0) live.reach = 0;
    }

    // Where to hit.
    const mid: Vec2 = [
      (live.eyeL[0] + live.eyeR[0]) / 2,
      (live.eyeL[1] + live.eyeR[1]) / 2,
    ];
    if (live.dev.aim) {
      [aim.current[0], aim.current[1]] = live.dev.aim;
    } else {
      const rest = live.poseRest ?? { yaw: 0, pitch: 0 };
      aimTarget(
        mid,
        live.yaw - rest.yaw,
        live.pitch - rest.pitch,
        personLeftSign(live.mirrored),
        aim.current,
      );
      aim.current[0] = Math.min(
        0.98,
        Math.max(0.02, aim.current[0] + live.dev.nudge[0]),
      );
      aim.current[1] = Math.min(
        0.98,
        Math.max(0.02, aim.current[1] + live.dev.nudge[1]),
      );
    }
    [live.aim[0], live.aim[1]] = aim.current;
    // The impact drags behind the aim; while idle it waits on the aim so a
    // new fire starts where you look.
    const ka =
      phase === "idle" && live.power === 0 ? 1 : 1 - Math.exp(-AIM.ease * dt);
    const aspect = state.size.width / Math.max(1, state.size.height);
    live.burnFrom[0] = live.target[0] * aspect;
    [, live.burnFrom[1]] = live.target;
    live.target[0] += (live.aim[0] - live.target[0]) * ka;
    live.target[1] += (live.aim[1] - live.target[1]) * ka;
    live.burnTo[0] = live.target[0] * aspect;
    [, live.burnTo[1]] = live.target;
    live.burning = live.power > 0.05 && live.reach > 0.95;

    // The coarse burn grid (sound freshness, dev readout).
    if (!grid.current || Math.abs(grid.current.aspect - aspect) > 0.01)
      grid.current = burnGrid(aspect);
    stepBurnGrid(
      grid.current,
      dt,
      live.burnFrom,
      live.burnTo,
      live.burning ? live.power : 0,
      burnRadius(),
      live.heat,
    );
  }, -1);
  return null;
};
