// Dev only: fire and aim without a face.
//   F (hold)      fire
//   arrow keys    nudge the aim; 0 resets the nudge
// window.__eyeBeam exposes the live state (firing, aim, heat, sound levels)
// and the tunable numbers, plus a few actions for driving it by script.
// Scene.tsx lazy-imports this behind an inline NODE_ENV check, so it never
// reaches production.
import { useEffect } from "react";

import type { Vec2 } from "./aim";
import { AIM, BEAM, BURN, FIRE, SOUND, SPARKS } from "./config";
import { readings } from "./fire";
import { live } from "./live";

const STEP = 0.03;

const DevKeys = () => {
  useEffect(() => {
    const api = {
      live,
      config: { FIRE, AIM, BEAM, BURN, SPARKS, SOUND },
      /** A short summary for logs. */
      get state() {
        const f = live.fire;
        return {
          tracked: live.tracked,
          phase: f.phase,
          staring: f.staring,
          score: +f.score.toFixed(3),
          calibrated: !!f.base,
          base: f.base,
          readings: readings(live.blendshapes),
          fires: f.fires,
          charge: +live.charge.toFixed(3),
          power: +live.power.toFixed(3),
          aim: live.aim.map((v) => +v.toFixed(3)),
          target: live.target.map((v) => +v.toFixed(3)),
          eyeL: live.eyeL.map((v) => +v.toFixed(3)),
          eyeR: live.eyeR.map((v) => +v.toFixed(3)),
          yaw: +live.yaw.toFixed(3),
          pitch: +live.pitch.toFixed(3),
          poseRest: live.poseRest,
          heat: { ...live.heat },
          audio: { ...live.audio },
        };
      },
      /** Hold fire on or off (like the F key). */
      fire: (on: boolean) => {
        live.dev.fire = on;
      },
      /** Pretend to raise the brows by this much (0 = your own face). */
      raiseBrows: (amount: number) => {
        live.dev.brows = amount;
      },
      /** Fix the aim at a screen point (uv, y up), or null to follow the head. */
      setAim: (at: Vec2 | null) => {
        live.dev.aim = at ? [at[0], at[1]] : null;
      },
      nudge: (dx: number, dy: number) => {
        live.dev.nudge[0] += dx;
        live.dev.nudge[1] += dy;
      },
      /** The exact burn, read back from the GPU. */
      readBurn: () =>
        (live as unknown as { readBurn?: () => unknown }).readBurn?.() ?? null,
    };
    (window as unknown as Record<string, unknown>).__eyeBeam = api;

    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") live.dev.fire = true;
      else if (e.key === "ArrowLeft") api.nudge(-STEP, 0);
      else if (e.key === "ArrowRight") api.nudge(STEP, 0);
      else if (e.key === "ArrowUp") api.nudge(0, STEP);
      else if (e.key === "ArrowDown") api.nudge(0, -STEP);
      else if (e.key === "0") {
        live.dev.nudge[0] = 0;
        live.dev.nudge[1] = 0;
      } else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") live.dev.fire = false;
    };
    const blur = () => {
      live.dev.fire = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return null;
};

export default DevKeys;
