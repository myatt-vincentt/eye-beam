// The beams, drawn in screen space over the picture: one from each eye
// centre to the impact, a white-hot core inside a red-orange glow that
// flickers along its length, a small flare where they hit, and a warm glow
// on the face around the eyes. While charging, the eyes glow brighter on
// their own; then the beams shoot out to the target.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Mesh } from "three";

import { BEAM } from "./config";
import { live } from "./live";
import { FULLSCREEN_VERTEX, NOISE } from "./shaders";

const FRAGMENT = /* glsl */ `
  uniform float aspect;
  uniform float time;
  uniform vec2 eyeL;
  uniform vec2 eyeR;
  uniform vec2 hit;
  uniform float reach;
  uniform float power;
  uniform float charge;
  uniform float gap;
  uniform float width;
  uniform float widen;
  uniform float faceGlow;
  varying vec2 vUv;
  ${NOISE}

  vec3 beam(vec2 p, vec2 a, vec2 b, float side) {
    float t;
    float d = segDist(p, a, b, t);
    float along = t * length(b - a);
    float flick = 0.82 + 0.18 * noise(vec2(along * 30.0 - time * 45.0, time * 23.0 + side * 5.0));
    float w = gap * width * (1.0 + widen * t) * flick;
    float core = exp(-pow(d / (w * 0.32), 2.0));
    float body = exp(-pow(d / w, 2.0));
    float halo = exp(-d / (w * 1.4));
    return vec3(1.0, 0.96, 0.88) * core * 1.25
      + vec3(1.0, 0.34, 0.08) * body * 0.6
      + vec3(0.9, 0.1, 0.02) * halo * 0.32;
  }

  vec3 eyeGlow(vec2 p, vec2 e) {
    float d = length(p - e);
    return vec3(1.0, 0.93, 0.8) * exp(-pow(d / (gap * 0.07), 2.0)) * (charge * 1.5 + power * 1.1)
      + vec3(1.0, 0.3, 0.06) * exp(-d / (gap * 0.16)) * (charge * 0.9 + power * 0.7);
  }

  void main() {
    vec2 p = vec2(vUv.x * aspect, vUv.y);
    vec3 col = vec3(0.0);
    if (power > 0.001) {
      col += beam(p, eyeL, mix(eyeL, hit, reach), 0.0) * power;
      col += beam(p, eyeR, mix(eyeR, hit, reach), 1.0) * power;
    }
    col += eyeGlow(p, eyeL) + eyeGlow(p, eyeR);
    // A warm glow on the face around the eyes.
    vec2 mid = (eyeL + eyeR) * 0.5;
    float dm = length((p - mid) * vec2(0.8, 1.25));
    col += vec3(1.0, 0.32, 0.08) * exp(-pow(dm / (gap * 0.95), 2.0)) * faceGlow * 0.22 * max(power, charge * 0.7);
    // The impact flare.
    if (reach > 0.9 && power > 0.001) {
      float w0 = gap * width * (1.0 + widen);
      float di = length(p - hit);
      float ang = atan(p.y - hit.y, p.x - hit.x);
      float rays = pow(abs(sin(ang * 5.0 + time * 3.0)), 16.0) + pow(abs(sin(ang * 3.0 - time * 2.1)), 24.0);
      float pulse = 0.85 + 0.15 * noise(vec2(time * 30.0, 0.0));
      float flare = exp(-pow(di / (w0 * 0.9), 2.0)) * 1.2
        + exp(-di / (w0 * 1.4)) * 0.35
        + rays * exp(-di / (w0 * 1.8)) * 0.3;
      col += vec3(1.0, 0.75, 0.45) * flare * power * pulse;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Above the burnt picture and the sparks. */
const RENDER_ORDER = 30;

export const Beams = () => {
  const mesh = useRef<Mesh>(null);
  const uniforms = useMemo(
    () => ({
      aspect: { value: 1 },
      time: { value: 0 },
      eyeL: { value: [0, 0] },
      eyeR: { value: [0, 0] },
      hit: { value: [0, 0] },
      reach: { value: 0 },
      power: { value: 0 },
      charge: { value: 0 },
      gap: { value: 0.14 },
      width: { value: BEAM.width },
      widen: { value: BEAM.widen },
      faceGlow: { value: BEAM.faceGlow },
    }),
    [],
  );
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const on = live.power > 0.001 || live.charge > 0.001;
    m.visible = on;
    if (!on) return;
    const aspect = state.size.width / Math.max(1, state.size.height);
    uniforms.aspect.value = aspect;
    uniforms.time.value = state.clock.elapsedTime;
    uniforms.eyeL.value = [live.eyeL[0] * aspect, live.eyeL[1]];
    uniforms.eyeR.value = [live.eyeR[0] * aspect, live.eyeR[1]];
    uniforms.hit.value = [live.target[0] * aspect, live.target[1]];
    uniforms.reach.value = live.reach;
    uniforms.power.value = live.power;
    uniforms.charge.value = live.charge;
    uniforms.gap.value = live.eyeGap;
  });
  return (
    <mesh
      ref={mesh}
      renderOrder={RENDER_ORDER}
      frustumCulled={false}
      visible={false}
    >
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={FULLSCREEN_VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        blending={AdditiveBlending}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
};
