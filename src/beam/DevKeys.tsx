// Dev only: fire and aim without a face.
//   F (hold)      fire
//   arrow keys    nudge the aim; 0 resets the nudge
//   E             crosshairs on the eyes (or ?eyes): green where the face
//                 reading puts each iris, red where the beams start
// window.__eyeBeam exposes the live state (firing, aim, heat, sound levels)
// and the tunable numbers, plus a few actions for driving it by script.
// Scene.tsx lazy-imports this behind an inline NODE_ENV check, so it never
// reaches production.
import { useEffect, useRef, useState } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";

import type { Vec2 } from "./aim";
import { AIM, BEAM, BURN, EYES, FIRE, SOUND, SPARKS } from "./config";
import { readings } from "./fire";
import { live } from "./live";

const STEP = 0.03;

/** A frame grabbed right after it was drawn, with where the eyes were. */
type Grab = {
  png: string;
  width: number;
  height: number;
  /** Beam origins and raw iris readings, in canvas pixels (y down). */
  origin: { l: Vec2; r: Vec2 };
  raw: { l: Vec2; r: Vec2 };
};

const Cross = ({ colour }: { colour: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: "block" }}>
    <path
      d="M12 0v9M12 15v9M0 12h9M15 12h9"
      stroke={colour}
      strokeWidth="1.5"
    />
  </svg>
);

/** Crosshairs on the raw iris readings (green) and the beam origins (red). */
const EyeCrosshairs = () => {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useFrame((state) => {
    const { width, height } = state.size;
    [live.rawEyeL, live.rawEyeR, live.eyeL, live.eyeR].forEach((e, i) => {
      const el = refs.current[i];
      if (el)
        el.style.transform = `translate(${e[0] * width - 12}px, ${(1 - e[1]) * height - 12}px)`;
    });
  });
  return (
    <Html fullscreen zIndexRange={[50, 0]} style={{ pointerEvents: "none" }}>
      {["#3f3", "#3f3", "#f33", "#f33"].map((c, i) => (
        <div
          // eslint-disable-next-line react/no-array-index-key -- fixed list
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          <Cross colour={c} />
        </div>
      ))}
    </Html>
  );
};

const DevKeys = () => {
  const gl = useThree((st) => st.gl);
  const [cross, setCross] = useState(() =>
    new URLSearchParams(window.location.search).has("eyes"),
  );
  const grabs = useRef<((g: Grab) => void)[]>([]);

  // Grab the canvas right after a frame is drawn, before it is shown, with
  // the eye positions that frame used: an exact pair for checking the lock.
  useEffect(
    () =>
      addAfterEffect(() => {
        if (!grabs.current.length) return;
        const c = gl.domElement;
        const px = (e: Vec2): Vec2 => [e[0] * c.width, (1 - e[1]) * c.height];
        const g: Grab = {
          png: c.toDataURL("image/png"),
          width: c.width,
          height: c.height,
          origin: { l: px(live.eyeL), r: px(live.eyeR) },
          raw: { l: px(live.rawEyeL), r: px(live.rawEyeR) },
        };
        grabs.current.splice(0).forEach((done) => done(g));
      }),
    [gl],
  );

  useEffect(() => {
    const api = {
      live,
      config: { FIRE, AIM, EYES, BEAM, BURN, SPARKS, SOUND },
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
      /** The next drawn frame as a PNG, with the eye positions it used. */
      grab: () =>
        new Promise<Grab>((done) => {
          grabs.current.push(done);
        }),
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
      else if (e.key === "e" || e.key === "E") setCross((v) => !v);
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
  return cross ? <EyeCrosshairs /> : null;
};

export default DevKeys;
