// Sparks spraying from the impact point while the beams burn: short glowing
// streaks thrown out and up, falling back as they cool from white-yellow to
// orange to red. Screen space, drawn just under the beams.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
} from "three";

import { SPARKS } from "./config";
import { live } from "./live";

const VERTEX = /* glsl */ `
  attribute vec4 tint;
  attribute float across;
  varying vec4 vTint;
  varying float vAcross;
  void main() {
    vTint = tint;
    vAcross = across;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec4 vTint;
  varying float vAcross;
  void main() {
    float k = 1.0 - vAcross * vAcross;
    gl_FragColor = vec4(vTint.rgb * vTint.a * k, 1.0);
  }
`;

const RENDER_ORDER = 25;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* eslint-disable no-param-reassign -- fills a buffer the caller owns */
/** White-yellow → orange → deep red over a spark's life (0 … 1). */
const sparkColour = (k: number, out: number[]) => {
  if (k < 0.3) {
    const t = k / 0.3;
    out[0] = 1;
    out[1] = lerp(0.95, 0.62, t);
    out[2] = lerp(0.75, 0.2, t);
  } else {
    const t = (k - 0.3) / 0.7;
    out[0] = lerp(1, 0.7, t);
    out[1] = lerp(0.62, 0.08, t);
    out[2] = lerp(0.2, 0.02, t);
  }
  return out;
};
/* eslint-enable no-param-reassign */

export const Sparks = () => {
  const sim = useMemo(() => {
    const n = SPARKS.max;
    const geometry = new BufferGeometry();
    const position = new BufferAttribute(new Float32Array(n * 4 * 3), 3);
    const tint = new BufferAttribute(new Float32Array(n * 4 * 4), 4);
    const across = new Float32Array(n * 4);
    const index = new Uint16Array(n * 6);
    for (let i = 0; i < n; i += 1) {
      across.set([-1, 1, -1, 1], i * 4);
      const v = i * 4;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    position.setUsage(DynamicDrawUsage);
    tint.setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", position);
    geometry.setAttribute("tint", tint);
    geometry.setAttribute("across", new BufferAttribute(across, 1));
    geometry.setIndex(new BufferAttribute(index, 1));
    return {
      geometry,
      position,
      tint,
      // Per spark: x, y (aspect space), vx, vy, age, life; age ≥ life = free.
      x: new Float32Array(n),
      y: new Float32Array(n),
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      age: new Float32Array(n).fill(1),
      life: new Float32Array(n).fill(1),
      owed: 0,
      next: 0,
      colour: [0, 0, 0],
    };
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const aspect = state.size.width / Math.max(1, state.size.height);
    const n = SPARKS.max;

    // New sparks at the impact, more while it's burning fresh picture.
    if (live.burning) {
      sim.owed += SPARKS.rate * live.power * (0.6 + 0.6 * live.heat.fresh) * dt;
      const hx = live.target[0] * aspect;
      const hy = live.target[1];
      const spread = live.eyeGap * 0.08;
      while (sim.owed >= 1) {
        sim.owed -= 1;
        const i = sim.next;
        sim.next = (sim.next + 1) % n;
        // Out and mostly up.
        const a = Math.PI * (0.5 + (Math.random() - 0.5) * 1.5);
        const sp = lerp(SPARKS.speed[0], SPARKS.speed[1], Math.random() ** 1.5);
        sim.x[i] = hx + (Math.random() - 0.5) * spread;
        sim.y[i] = hy + (Math.random() - 0.5) * spread;
        sim.vx[i] = Math.cos(a) * sp;
        sim.vy[i] = Math.sin(a) * sp * 0.9;
        sim.age[i] = 0;
        sim.life[i] = lerp(SPARKS.life[0], SPARKS.life[1], Math.random());
      }
    }

    const pos = sim.position.array as Float32Array;
    const tint = sim.tint.array as Float32Array;
    const w = SPARKS.width;
    // Aspect space → clip space.
    const cx = (x: number) => (x / aspect) * 2 - 1;
    const cy = (y: number) => y * 2 - 1;
    for (let i = 0; i < n; i += 1) {
      const p = i * 12;
      const c = i * 16;
      if (sim.age[i] >= sim.life[i]) {
        tint.fill(0, c, c + 16);
        pos.fill(0, p, p + 12);
      } else {
        sim.age[i] += dt;
        sim.vy[i] -= SPARKS.gravity * dt;
        sim.vx[i] *= 1 - 1.2 * dt;
        sim.x[i] += sim.vx[i] * dt;
        sim.y[i] += sim.vy[i] * dt;
        const k = Math.min(1, sim.age[i] / sim.life[i]);
        // A streak from where it was a moment ago to where it is.
        const hx = sim.x[i];
        const hy = sim.y[i];
        const tx = hx - sim.vx[i] * SPARKS.streak;
        const ty = hy - sim.vy[i] * SPARKS.streak;
        let nx = -(hy - ty);
        let ny = hx - tx;
        const len = Math.hypot(nx, ny) || 1;
        const ww = w * (1 - 0.5 * k);
        nx = (nx / len) * ww;
        ny = (ny / len) * ww;
        pos[p] = cx(hx - nx);
        pos[p + 1] = cy(hy - ny);
        pos[p + 3] = cx(hx + nx);
        pos[p + 4] = cy(hy + ny);
        pos[p + 6] = cx(tx - nx);
        pos[p + 7] = cy(ty - ny);
        pos[p + 9] = cx(tx + nx);
        pos[p + 10] = cy(ty + ny);
        const col = sparkColour(k, sim.colour);
        const alpha = (1 - k) ** 1.4 * 1.6;
        for (let v = 0; v < 4; v += 1) {
          const o = c + v * 4;
          const fade = v < 2 ? 1 : 0.25; // the tail is dimmer
          tint.set(col, o);
          tint[o + 3] = alpha * fade;
        }
      }
    }
    sim.position.needsUpdate = true;
    sim.tint.needsUpdate = true;
  });

  return (
    <mesh
      geometry={sim.geometry}
      renderOrder={RENDER_ORDER}
      frustumCulled={false}
    >
      <shaderMaterial
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        side={DoubleSide}
        blending={AdditiveBlending}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
};
