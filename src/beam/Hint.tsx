// The only hint, wordless: a small see-through ghost face low in the centre
// (the SDK's FaceExpressionHint) that widens its eyes and fires two tiny
// beams. It fades in shortly after a face appears and goes for good once
// the beams have fired for real.
import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
} from "three";
// eslint-disable-next-line import/extensions
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
// eslint-disable-next-line import/extensions
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FaceExpressionHint } from "@vincentt-xr/sdk/instructions";

import { live } from "./live";

const HINT = {
  /** Seconds after a face appears before it fades in, and fade times. */
  delay: 1.2,
  fadeIn: 0.5,
  fadeOut: 0.45,
  /** Low centre, above the speaker (world units at the camera's z = 0 plane). */
  y: -1.2,
  height: 0.46,
  renderOrder: 40,
  /** The tiny beams: width, and how far below the eyes they meet. */
  beamWidth: 0.014,
  drop: 0.22,
};

const FACE_URL = "/models/face-v1.glb";
const EXPRESSION = { targets: { surprised: 1 } };
const LOOK = { halo: false as const, glow: false as const };
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const BEAM_VERTEX = /* glsl */ `
  attribute float across;
  attribute float along;
  varying float vAcross;
  varying float vAlong;
  void main() {
    vAcross = across;
    vAlong = along;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform float strength;
  varying float vAcross;
  varying float vAlong;
  void main() {
    float d = abs(vAcross);
    float core = exp(-d * d * 30.0);
    float glow = exp(-d * d * 4.0);
    vec3 c = vec3(1.0, 0.95, 0.85) * core + vec3(1.0, 0.32, 0.06) * glow * 0.8;
    gl_FragColor = vec4(c * strength * (0.6 + 0.4 * vAlong), 1.0);
  }
`;

/** The iris's two centres in the face model's own space. */
const irisCentres = (model: Object3D) => {
  let iris: Mesh | null = null;
  model.traverse((o) => {
    const m = o as Mesh;
    const mat = m.material as { name?: string } | undefined;
    if (m.isMesh && mat?.name === "iris") iris = m;
  });
  if (!iris) return null;
  const pos = (iris as Mesh).geometry.getAttribute("position");
  const l = new Vector3();
  const r = new Vector3();
  let nl = 0;
  let nr = 0;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    if (v.x < 0) {
      l.add(v);
      nl += 1;
    } else {
      r.add(v);
      nr += 1;
    }
  }
  return {
    geometry: (iris as Mesh).geometry,
    a: l.divideScalar(Math.max(1, nl)),
    b: r.divideScalar(Math.max(1, nr)),
  };
};

export const Hint = () => {
  // face-v1.glb is meshopt-compressed: the loader needs the decoder.
  const face = useLoader(GLTFLoader, FACE_URL, (l) =>
    l.setMeshoptDecoder(MeshoptDecoder),
  );
  const g = useRef<Group>(null);
  const shown = useRef(-1);
  const goneAt = useRef(-1);
  const done = useRef(false);
  const eyes = useMemo(() => irisCentres(face.scene), [face]);
  const beams = useMemo(() => {
    const geometry = new BufferGeometry();
    const position = new BufferAttribute(new Float32Array(8 * 3), 3);
    position.setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", position);
    geometry.setAttribute(
      "across",
      new BufferAttribute(new Float32Array([-1, 1, -1, 1, -1, 1, -1, 1]), 1),
    );
    geometry.setAttribute(
      "along",
      new BufferAttribute(new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]), 1),
    );
    geometry.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
    return { geometry, position, uniforms: { strength: { value: 0 } } };
  }, []);
  const beamMesh = useRef<Mesh>(null);
  const tmp = useMemo(
    () => ({ a: new Vector3(), b: new Vector3(), hit: new Vector3() }),
    [],
  );

  useFrame((state) => {
    const o = g.current;
    const bm = beamMesh.current;
    if (!o || !bm) return;
    if (done.current) {
      o.visible = false;
      bm.visible = false;
      return;
    }
    const t = state.clock.elapsedTime;
    if (shown.current < 0 && live.tracked) shown.current = t;
    if (live.firedOnce && goneAt.current < 0 && shown.current >= 0)
      goneAt.current = t;
    let k =
      shown.current < 0
        ? 0
        : easeOut((t - shown.current - HINT.delay) / HINT.fadeIn);
    if (goneAt.current >= 0) {
      const out = (t - goneAt.current) / HINT.fadeOut;
      k = Math.min(k, 1 - easeOut(out));
      if (out >= 1) done.current = true;
    }
    o.visible = k > 0.001;
    o.scale.setScalar(Math.max(1e-4, k));

    // The tiny beams fire while the face's eyes are widest.
    let wide = 0;
    let irisMesh: Mesh | null = null;
    o.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      const idx = m.morphTargetDictionary?.surprised;
      if (idx !== undefined && m.morphTargetInfluences)
        wide = Math.max(wide, m.morphTargetInfluences[idx] ?? 0);
      if (eyes && m.geometry === eyes.geometry) irisMesh = m;
    });
    const strength = smoothstep(0.55, 0.9, wide) * k;
    bm.visible = o.visible && strength > 0.01 && !!irisMesh;
    if (!bm.visible || !eyes || !irisMesh) return;
    const im = irisMesh as Mesh;
    im.updateWorldMatrix(true, false);
    tmp.a.copy(eyes.a).applyMatrix4(im.matrixWorld);
    tmp.b.copy(eyes.b).applyMatrix4(im.matrixWorld);
    tmp.hit.copy(tmp.a).add(tmp.b).multiplyScalar(0.5);
    tmp.hit.y -= HINT.drop * k;
    tmp.hit.z += 0.05;
    const p = beams.position.array as Float32Array;
    const w = HINT.beamWidth * k;
    [tmp.a, tmp.b].forEach((e, i) => {
      // A flat quad from the eye to the meeting point, facing the camera.
      const dx = tmp.hit.x - e.x;
      const dy = tmp.hit.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * w;
      const ny = (dx / len) * w;
      const z = e.z + 0.02;
      p.set(
        [
          e.x - nx,
          e.y - ny,
          z,
          e.x + nx,
          e.y + ny,
          z,
          tmp.hit.x - nx * 1.6,
          tmp.hit.y - ny * 1.6,
          z,
          tmp.hit.x + nx * 1.6,
          tmp.hit.y + ny * 1.6,
          z,
        ],
        i * 12,
      );
    });
    beams.position.needsUpdate = true;
    beams.geometry.computeBoundingSphere();
    beams.uniforms.strength.value = strength;
  });

  return (
    <>
      <group ref={g} position={[0, HINT.y, 0]} visible={false}>
        <FaceExpressionHint
          expression={EXPRESSION}
          model={face.scene}
          height={HINT.height}
          orbit={0}
          look={LOOK}
          renderOrder={HINT.renderOrder}
        />
      </group>
      <mesh
        ref={beamMesh}
        geometry={beams.geometry}
        renderOrder={HINT.renderOrder + 1}
        frustumCulled={false}
        visible={false}
      >
        <shaderMaterial
          uniforms={beams.uniforms}
          vertexShader={BEAM_VERTEX}
          fragmentShader={BEAM_FRAGMENT}
          transparent
          side={DoubleSide}
          blending={AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
};
