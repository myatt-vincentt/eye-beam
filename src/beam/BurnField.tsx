// The burn on the picture. A half-resolution heat-and-char texture lives in
// screen space (so a burn stays where it was made while you move): each
// frame the beam heats it along the impact's path, heat chars the picture,
// and everything cools, embers first, until the char fades back to the live
// picture. The camera picture is then drawn through it, just above App.tsx's
// VideoBackground (GROUNDING.md, camera effects), for everything on screen,
// you included:
//   hot      a glowing white-yellow core
//   burning  orange glowing edges where the char spreads
//   charred  black-brown char with ragged, fibrous edges, like burnt paper
// plus faint smoke wisps rising from hot spots and heat shimmer around them
// and along the beams.
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
} from "three";
import { useXRCameraTexture } from "@vincentt-xr/sdk/low-level";

import { BEAM, BURN } from "./config";
import { burnRadius } from "./Inputs";
import { live } from "./live";
import { FULLSCREEN_VERTEX, NOISE } from "./shaders";

const UPDATE_FRAGMENT = /* glsl */ `
  uniform sampler2D prev;
  uniform vec2 from;
  uniform vec2 to;
  uniform float aspect;
  uniform float radius;
  uniform float power;
  uniform float dt;
  uniform float heatRate;
  uniform float heatMax;
  uniform float charFrom;
  uniform float charRate;
  uniform float cool;
  uniform float charFade;
  uniform float fadeBelow;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec4 s = texture2D(prev, vUv);
    float heat = s.r;
    float ch = s.g;
    vec2 p = vec2(vUv.x * aspect, vUv.y);
    float t;
    float d = segDist(p, from, to, t);
    // A ragged reach, so the burn's outline isn't a clean circle.
    float r = radius * (0.75 + 0.5 * fbm(p * 26.0));
    // A hot centre and a soft, wide skirt that only scorches.
    float f = exp(-pow(d / r, 2.0) * 2.5) + 0.07 * exp(-pow(d / (r * 2.2), 2.0));
    heat = min(heatMax, heat + heatRate * power * f * dt);
    ch = min(1.0, ch + charRate * dt * max(heat - charFrom, 0.0));
    heat *= exp(-dt / cool);
    float cooled = 1.0 - clamp(heat / fadeBelow, 0.0, 1.0);
    ch = max(0.0, ch - dt / charFade * cooled);
    gl_FragColor = vec4(heat, ch, 0.0, 1.0);
  }
`;

const DISPLAY_FRAGMENT = /* glsl */ `
  uniform sampler2D cameraTexture;
  uniform sampler2D burnTexture;
  uniform float aspect;
  uniform float time;
  uniform float power;
  uniform float beamWidth;
  uniform vec2 eyeL;
  uniform vec2 eyeR;
  uniform vec2 hit;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * aspect, uv.y);
    vec4 b = texture2D(burnTexture, uv);
    float heat = b.r;
    float ch = b.g;
    // Smoke: the heat just below, drifting up and swaying.
    float smoke = 0.0;
    for (int i = 1; i <= 4; i++) {
      float fi = float(i);
      vec2 o = vec2(sin(time * 1.3 + fi * 1.7 + uv.y * 18.0) * 0.006 * fi, -0.028 * fi);
      smoke += texture2D(burnTexture, uv + o).r * (1.0 - fi * 0.18);
    }
    // Hot air along the beams.
    float tt;
    float db = min(segDist(p, eyeL, hit, tt), segDist(p, eyeR, hit, tt));
    float haze = power * exp(-db / (beamWidth * 3.0));
    if (heat + ch + smoke + haze < 0.004) {
      gl_FragColor = vec4(texture2D(cameraTexture, uv).rgb, 1.0);
      return;
    }
    vec2 wob = vec2(
      noise(p * vec2(38.0, 22.0) + vec2(0.0, -time * 4.0)),
      noise(p * vec2(38.0, 22.0) + vec2(7.3, -time * 4.6))
    ) - 0.5;
    float shim = clamp(heat, 0.0, 1.0) * 0.007 + clamp(smoke, 0.0, 1.0) * 0.003 + haze * 0.005;
    vec3 cam = texture2D(cameraTexture, uv + wob * shim).rgb;

    // Burnt paper: the burn is read through a small ragged warp (big tears
    // and fine fibres), so its outline frays instead of following a circle.
    vec2 tear = vec2(fbm(p * 18.0), fbm(p * 18.0 + 5.3)) - 0.5;
    vec2 fibre = vec2(fbm(p * vec2(64.0, 20.0)), fbm(p * vec2(20.0, 64.0) + 2.0)) - 0.5;
    vec4 w = texture2D(burnTexture, uv + (tear * 0.03 + fibre * 0.012) * vec2(1.0 / aspect, 1.0));
    heat = max(heat * 0.6, w.r);
    ch = w.g;
    // How much char it takes to blacken each spot (paper burns unevenly).
    float edge = 0.12 + 0.5 * fbm(p * 11.0) + 0.16 * (fbm(p * 48.0) - 0.5);
    float charM = smoothstep(edge - 0.03, edge + 0.03, ch);
    float deep = smoothstep(edge, edge + 0.45, ch);
    // Scorch: the picture toasts brown just ahead of the char.
    float scorch = smoothstep(edge * 0.3, edge, ch);
    float l = dot(cam, vec3(0.299, 0.587, 0.114));
    vec3 toast = mix(cam, vec3(l) * vec3(1.0, 0.68, 0.4), 0.7) * (1.0 - 0.55 * scorch);
    vec3 c = mix(cam, toast, scorch);
    // Char: brown at the edge, black deeper in, with a grain.
    float grain = 0.7 + 0.6 * fbm(p * 40.0 + 3.0);
    vec3 charCol = mix(vec3(0.2, 0.1, 0.045), vec3(0.03, 0.022, 0.018), deep) * grain;
    c = mix(c, charCol + cam * 0.04, charM);

    // Burning: glowing orange edges where the char spreads, while it's hot.
    float hotness = smoothstep(0.06, 0.7, heat);
    float flick = 0.75 + 0.25 * noise(p * 50.0 + time * vec2(2.1, -3.3));
    vec3 ember = vec3(1.0, 0.36, 0.05);
    float rim = smoothstep(edge - 0.22, edge - 0.02, ch) * (1.0 - smoothstep(edge, edge + 0.1, ch));
    c += ember * rim * hotness * flick * 2.6;
    // Embers: glowing cracks in the char that fade as it cools.
    float vein = 1.0 - abs(fbm(p * 26.0 + vec2(0.0, time * 0.05)) * 2.0 - 1.0);
    float crack = smoothstep(0.84, 0.97, vein);
    c += ember * charM * smoothstep(0.02, 0.5, heat) * (crack * 2.4 + 0.08) * flick;
    // Hot: an orange bloom, then a white-yellow core.
    c += vec3(1.0, 0.42, 0.08) * smoothstep(0.7, 1.4, heat) * 0.6;
    c = mix(c, vec3(1.0, 0.94, 0.72), smoothstep(1.15, 1.8, heat) * 0.92);

    // Faint grey wisps rising above hot spots.
    float wisp = fbm(vec2(p.x * 9.0 + sin(p.y * 6.0 + time) * 0.4, p.y * 6.0 - time * 0.55));
    float sm = clamp(smoke * 0.35, 0.0, 1.0) * smoothstep(0.35, 0.75, wisp);
    c = mix(c, vec3(0.5, 0.48, 0.46), sm * 0.45);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const targetOptions = {
  type: HalfFloatType,
  format: RGBAFormat,
  minFilter: LinearFilter,
  magFilter: LinearFilter,
  depthBuffer: false,
  stencilBuffer: false,
};

/** The longest side of the burn texture (pixels). */
const MAX_SIDE = 1024;

export type BurnReadout = {
  width: number;
  height: number;
  maxHeat: number;
  meanHeat: number;
  hot: number;
  charred: number;
};

/** The burn field's textures and its update pass. */
const useBurnTargets = () =>
  useMemo(() => {
    const a = new WebGLRenderTarget(4, 4, targetOptions);
    const b = new WebGLRenderTarget(4, 4, targetOptions);
    const material = new ShaderMaterial({
      uniforms: {
        prev: { value: null as Texture | null },
        from: { value: [0, 0] },
        to: { value: [0, 0] },
        aspect: { value: 1 },
        radius: { value: BURN.radius },
        power: { value: 0 },
        dt: { value: 0 },
        heatRate: { value: BURN.heatRate },
        heatMax: { value: BURN.heatMax },
        charFrom: { value: BURN.charFrom },
        charRate: { value: BURN.charRate },
        cool: { value: BURN.cool },
        charFade: { value: BURN.charFade },
        fadeBelow: { value: BURN.fadeBelow },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: UPDATE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const scene = new Scene();
    scene.add(quad);
    return {
      targets: [a, b],
      read: 0,
      material,
      scene,
      camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    };
  }, []);

export const BurnField = () => {
  const cameraTexture = useXRCameraTexture();
  const gl = useThree((s) => s.gl);
  const field = useBurnTargets();
  const display = useMemo(
    () => ({
      cameraTexture: { value: null as unknown },
      burnTexture: { value: field.targets[0].texture as Texture },
      aspect: { value: 1 },
      time: { value: 0 },
      power: { value: 0 },
      beamWidth: { value: 0.02 },
      eyeL: { value: [0, 0] },
      eyeR: { value: [0, 0] },
      hit: { value: [0, 0] },
    }),
    [field],
  );

  useEffect(
    () => () => {
      field.targets.forEach((t) => t.dispose());
      field.material.dispose();
    },
    [field],
  );

  // Dev readout: the exact burn, read back from the GPU (slow; on demand).
  useEffect(() => {
    const read = (): BurnReadout => {
      const rt = field.targets[field.read];
      const { width, height } = rt;
      const px = new Uint16Array(width * height * 4);
      gl.readRenderTargetPixels(rt, 0, 0, width, height, px);
      let maxHeat = 0;
      let sum = 0;
      let hot = 0;
      let charred = 0;
      for (let i = 0; i < width * height; i += 1) {
        const h = DataUtils.fromHalfFloat(px[i * 4]);
        const c = DataUtils.fromHalfFloat(px[i * 4 + 1]);
        if (h > maxHeat) maxHeat = h;
        sum += h;
        if (h > 0.5) hot += 1;
        if (c > 0.3) charred += 1;
      }
      const n = width * height;
      return {
        width,
        height,
        maxHeat,
        meanHeat: sum / n,
        hot: hot / n,
        charred: charred / n,
      };
    };
    (live as unknown as { readBurn?: () => BurnReadout }).readBurn = read;
  }, [field, gl]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const { width, height } = state.size;
    const aspect = width / Math.max(1, height);
    const dpr = state.gl.getPixelRatio();
    let w = Math.round(width * dpr * BURN.scale);
    let h = Math.round(height * dpr * BURN.scale);
    const over = Math.max(w, h) / MAX_SIDE;
    if (over > 1) {
      w = Math.round(w / over);
      h = Math.round(h / over);
    }
    const [a] = field.targets;
    if (a.width !== w || a.height !== h)
      field.targets.forEach((t) => t.setSize(Math.max(1, w), Math.max(1, h)));

    // Heat along the impact's path, then cool.
    const u = field.material.uniforms;
    const readRt = field.targets[field.read];
    const writeRt = field.targets[1 - field.read];
    u.prev.value = readRt.texture;
    u.from.value = live.burnFrom;
    u.to.value = live.burnTo;
    u.aspect.value = aspect;
    u.radius.value = burnRadius();
    u.power.value = live.burning ? live.power : 0;
    u.dt.value = dt;
    // Tunable while running (dev readout): the numbers live in BURN.
    u.heatRate.value = BURN.heatRate;
    u.charRate.value = BURN.charRate;
    u.cool.value = BURN.cool;
    u.charFade.value = BURN.charFade;
    u.fadeBelow.value = BURN.fadeBelow;
    const before = gl.getRenderTarget();
    gl.setRenderTarget(writeRt);
    gl.render(field.scene, field.camera);
    gl.setRenderTarget(before);
    field.read = 1 - field.read;

    display.burnTexture.value = writeRt.texture;
    display.aspect.value = aspect;
    display.time.value = state.clock.elapsedTime;
    display.power.value = live.power * live.reach;
    display.beamWidth.value = live.eyeGap * BEAM.width;
    display.eyeL.value = [live.eyeL[0] * aspect, live.eyeL[1]];
    display.eyeR.value = [live.eyeR[0] * aspect, live.eyeR[1]];
    display.hit.value = [live.target[0] * aspect, live.target[1]];
  });

  if (!cameraTexture) return null; // tracker / media startup and source swaps
  display.cameraTexture.value = cameraTexture;
  return (
    <mesh renderOrder={-998} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={display}
        vertexShader={FULLSCREEN_VERTEX}
        fragmentShader={DISPLAY_FRAGMENT}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
};
