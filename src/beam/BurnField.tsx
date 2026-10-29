// The burn on the picture, like scorched paper or photo film. A half-
// resolution heat-and-char texture lives in screen space (so a burn stays
// where it was made while you move): each frame the beam heats it along the
// impact's path, the heat spreads a little so the burning edge creeps
// outward, heat chars the picture, and everything cools. The camera picture
// is then drawn through it, just above App.tsx's VideoBackground
// (GROUNDING.md, camera effects), for everything on screen, you included:
//   hot      a small white-yellow point with a thin orange ring at the beam tip
//   burning  a thin, ragged orange ember line at the edge, with flecks past it
//   charred  matte black char with grey ash, fine cracks and flakes, a curled
//            lip at the edge, and a toasted brown-caramel-tan halo outside it
// plus thin smoke wisps rising from the hot edge and heat shimmer around it
// and along the beams. Cooling: the ember line fades first, then the char
// greys to ash and the scorch fades back to the live picture.
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
  uniform vec2 texel;
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
  uniform float spread;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec4 s = texture2D(prev, vUv);
    float heat = s.r;
    float ch = s.g;
    // The heat spreads a little into its neighbours, so the burning edge
    // creeps outward while it's hot.
    vec2 o = texel * 1.5;
    float around = 0.25 * (
      texture2D(prev, vUv + vec2(o.x, 0.0)).r + texture2D(prev, vUv - vec2(o.x, 0.0)).r +
      texture2D(prev, vUv + vec2(0.0, o.y)).r + texture2D(prev, vUv - vec2(0.0, o.y)).r
    );
    heat = max(heat, mix(heat, around, min(1.0, spread * dt)));
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
  uniform float radius;
  uniform float beamWidth;
  uniform vec2 eyeL;
  uniform vec2 eyeR;
  uniform vec2 hit;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * aspect, uv.y);
    vec4 b0 = texture2D(burnTexture, uv);
    // Smoke: the heat just below, drifting up and swaying.
    float smoke = 0.0;
    for (int i = 1; i <= 4; i++) {
      float fi = float(i);
      vec2 o = vec2(sin(time * 1.3 + fi * 1.7 + uv.y * 18.0) * 0.006 * fi, -0.03 * fi);
      smoke += texture2D(burnTexture, uv + o).r * (1.0 - fi * 0.18);
    }
    // Hot air along the beams, and the impact point.
    float tt;
    float db = min(segDist(p, eyeL, hit, tt), segDist(p, eyeR, hit, tt));
    float haze = power * exp(-db / (beamWidth * 3.0));
    float dh = length(p - hit);
    float tip = power * exp(-pow(dh / radius, 2.0));
    // The char around this spot (two rings of taps): the scorch reaches out
    // past the edge, and the middle of a burn stays darkest.
    float near = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785 + 0.3;
      float rr = i < 4 ? 0.022 : 0.05;
      near += texture2D(burnTexture, uv + vec2(cos(a) / aspect, sin(a)) * rr).g;
    }
    near /= 8.0;

    if (b0.r + b0.g + near + smoke + haze + tip < 0.004) {
      gl_FragColor = vec4(texture2D(cameraTexture, uv).rgb, 1.0);
      return;
    }
    vec2 wob = vec2(
      noise(p * vec2(38.0, 22.0) + vec2(0.0, -time * 4.0)),
      noise(p * vec2(38.0, 22.0) + vec2(7.3, -time * 4.6))
    ) - 0.5;
    float shim = clamp(b0.r, 0.0, 1.0) * 0.005 + clamp(smoke, 0.0, 1.0) * 0.003 + haze * 0.005;
    vec3 cam = texture2D(cameraTexture, uv + wob * shim).rgb;

    // Read the burn through a small ragged warp (tears and fine fibres), so
    // its outline frays like paper instead of following a circle.
    vec2 tear = vec2(fbm(p * 14.0), fbm(p * 14.0 + 5.3)) - 0.5;
    vec2 fibre = vec2(noise(p * vec2(110.0, 34.0)), noise(p * vec2(34.0, 110.0) + 4.0)) - 0.5;
    vec4 b = texture2D(burnTexture, uv + (tear * 0.022 + fibre * 0.007) * vec2(1.0 / aspect, 1.0));
    float heat = b.r;
    float ch = b.g;
    float grain = noise(p * 260.0);

    // Where the paper gives way: char above this level is burnt through.
    float e = 0.42 + 0.2 * (fbm(p * 9.0) - 0.5) + 0.1 * (noise(p * 70.0) - 0.5);
    float d = ch - e;
    float inside = smoothstep(-0.012, 0.012, d);

    // Scorch halo: the picture itself heat-browned, tan to caramel to dark
    // brown towards the edge, with a paper grain.
    float tg = clamp(max(ch / e, near * 1.5) + (grain - 0.5) * 0.12, 0.0, 1.0);
    vec3 toast = mix(
      mix(vec3(0.97, 0.82, 0.6), vec3(0.8, 0.5, 0.22), smoothstep(0.2, 0.6, tg)),
      vec3(0.32, 0.16, 0.06),
      smoothstep(0.6, 1.0, tg)
    );
    float l = dot(cam, vec3(0.299, 0.587, 0.114));
    vec3 browned = mix(cam, vec3(l), 0.5) * toast * 1.1;
    vec3 c = mix(cam, browned, smoothstep(0.02, 0.35, tg));

    // Char: matte black, greying towards ash as it cools (the middle stays
    // darkest), with ash mottling, fine cracks and light ash flecks.
    float ash = smoothstep(1.0, e + 0.06, ch) * (1.0 - 0.75 * smoothstep(0.45, 0.95, near));
    float mott = fbm(p * 45.0 + 7.0);
    vec3 charC = mix(vec3(0.028, 0.025, 0.023), vec3(0.3, 0.29, 0.28), ash * 0.75);
    charC *= 0.75 + 0.5 * mott;
    charC *= 0.9 + 0.2 * grain;
    vec2 fc = fract(p * 190.0) - 0.5;
    float flake = step(0.93, hash(floor(p * 190.0) + 11.0)) * smoothstep(0.4, 0.15, length(fc));
    charC += vec3(0.24, 0.235, 0.23) * flake * (0.35 + 0.65 * ash);
    float crack = abs(noise(p * 115.0 + 2.0) * 2.0 - 1.0);
    charC *= mix(0.45, 1.0, smoothstep(0.012, 0.04, crack));
    // Curl: a lighter lifted lip right at the edge, a shadow just inside it.
    float lip = smoothstep(0.0, 0.025, d) * (1.0 - smoothstep(0.025, 0.07, d));
    float shade = smoothstep(0.05, 0.1, d) * (1.0 - smoothstep(0.1, 0.22, d));
    charC += vec3(0.17, 0.13, 0.1) * lip * (1.0 - 0.7 * ash);
    charC *= 1.0 - 0.4 * shade;
    c = mix(c, charC, inside);

    // Burning: a thin, ragged ember line at the edge while it's hot, and a
    // few tiny flecks just past it.
    float hot = smoothstep(0.06, 0.45, heat);
    float flick = 0.7 + 0.3 * noise(p * 60.0 + time * vec2(1.7, -2.9));
    float jag = smoothstep(0.25, 0.75, noise(p * vec2(150.0, 120.0) + vec2(0.0, time * 1.5)));
    float line = smoothstep(-0.09, -0.015, d) * (1.0 - smoothstep(0.0, 0.04, d));
    vec3 ember = vec3(1.0, 0.42, 0.07);
    c += ember * line * hot * (0.35 + 0.9 * jag) * flick * 2.2;
    c += vec3(1.0, 0.86, 0.55) * line * smoothstep(0.45, 1.0, heat) * jag * 0.7;
    vec2 cell = floor(p * 240.0);
    vec2 cf = fract(p * 240.0) - 0.5;
    float dot1 = smoothstep(0.35, 0.1, length(cf));
    float fleck = step(0.975, hash(cell + floor(time * 8.0) * 1.37)) * dot1;
    float past = smoothstep(-0.2, -0.05, d) * (1.0 - inside);
    c += ember * fleck * past * hot * 2.4;
    // Dying ember specks in the char that blink out quickly.
    float speck = step(0.993, hash(cell + 3.0)) * dot1;
    c += ember * speck * inside * smoothstep(0.35, 0.9, heat) * flick * 2.2;

    // Hot impact: a small white-yellow point with a thin orange ring.
    float core = exp(-pow(dh / (radius * 0.22), 2.0)) * power;
    float ring = exp(-pow((dh - radius * 0.42) / (radius * 0.07), 2.0)) * power;
    c = mix(c, vec3(1.0, 0.96, 0.82), clamp(core * 1.3, 0.0, 1.0));
    c += ember * ring * (0.8 + 0.4 * jag);

    // Thin grey wisps rising from the hot edge.
    float wisp = fbm(vec2(p.x * 24.0 + sin(p.y * 9.0 + time) * 0.6, p.y * 4.0 - time * 0.7));
    float sm = clamp(smoke * 0.3, 0.0, 1.0) * smoothstep(0.55, 0.8, wisp);
    c = mix(c, vec3(0.55, 0.54, 0.53), sm * 0.4);
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
        texel: { value: [1 / 4, 1 / 4] },
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
        spread: { value: BURN.spread },
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
      radius: { value: BURN.radius },
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
    u.texel.value = [1 / readRt.width, 1 / readRt.height];
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
    u.spread.value = BURN.spread;
    const before = gl.getRenderTarget();
    gl.setRenderTarget(writeRt);
    gl.render(field.scene, field.camera);
    gl.setRenderTarget(before);
    field.read = 1 - field.read;

    display.burnTexture.value = writeRt.texture;
    display.aspect.value = aspect;
    display.time.value = state.clock.elapsedTime;
    display.power.value = live.power * live.reach;
    display.radius.value = burnRadius();
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
