// Every tunable number in one place: when the beams fire, where they aim,
// how they look, and how fast a burn heats, chars and cools back to the
// live picture.

/** Face inference rate. Every face reader asks for the same rate. */
export const FACE_FPS = 30;

/**
 * The beam origins sit on the iris centres of the face model's newest
 * result, read every frame. Only a very light One Euro filter steadies a
 * still reading's shake; its cutoff rises fast with motion, so the beams
 * never trail the eyes. Uv units (screen fractions per second).
 */
export const EYES = {
  filter: { minCutoff: 3, beta: 150, dCutoff: 10 },
  /**
   * Between face results the origins carry on along the eyes' motion; this
   * adds extra seconds of lead if a device shows the picture ahead of its
   * face results (0 measured best on the test clips).
   */
  latency: 0,
};

/** Firing: widen your eyes or raise your brows, against your resting face. */
export const FIRE = {
  /** Seconds of face to learn your resting face from. */
  calibrate: 1.2,
  /** The resting face keeps learning: seconds for it to follow a drift. */
  adapt: 5,
  /**
   * The most each reading can be at rest: anything above this while learning
   * is a stare already showing, not the resting face.
   */
  restMax: { eyes: 0.3, brows: 0.35 },
  /** How far each reading must rise above your resting face to score 1. */
  span: { eyes: 0.18, brows: 0.38 },
  /** Score to start firing, and the score to keep firing once started. */
  enter: 1,
  exit: 0.6,
  /** Seconds the stare must hold before the charge starts. */
  hold: 0.18,
  /** Seconds below the keep score before the beams stop. */
  release: 0.2,
  /** Seconds the eyes glow brighter before the beams ignite. */
  charge: 0.25,
  /** Seconds without a face before the beams stop. */
  faceLost: 0.4,
};

/** Aiming with the head: the target follows where the face points. */
export const AIM = {
  /** Looking straight: the target sits here (screen uv, y up). */
  rest: [0.5, 0.36] as const,
  /** How much your own place on screen moves that spot with you (0 … 1). */
  follow: 0.6,
  /** Below the eyes when looking straight (screen uv), for `follow`. */
  below: 0.24,
  /** Screen uv per unit of tan(turn): sideways and up/down. */
  gain: [1.25, 1.1] as const,
  /** Keep the target this far inside the screen edges (uv). */
  margin: 0.03,
  /** Per-second easing of the target: the beam drags a little behind. */
  ease: 16,
  /** Per-second easing of the head turn readings. */
  poseEase: 12,
  /**
   * "Straight" is your usual head pose (a phone held low tilts every face
   * down): seconds for it to follow while the beams are off, and how far
   * from facing the camera it may be (radians).
   */
  restAdapt: 3,
  restMax: { yaw: 0.35, pitch: 0.45 },
};

/** The look of the beams (sizes are fractions of the eye-to-eye distance). */
export const BEAM = {
  /** Beam width at the eye, and how much wider it gets by the impact. */
  width: 0.14,
  widen: 0.5,
  /** Seconds for the beams to reach the target as they ignite. */
  ignite: 0.09,
  /** Seconds for the beams to fade away on stop. */
  fadeOut: 0.22,
  /** Glow around the eyes and on the face while firing. */
  faceGlow: 1.25,
};

/** The burn on the picture (screen space, half resolution). */
export const BURN = {
  /** Burn field size against the screen. */
  scale: 0.5,
  /** Impact radius (fraction of the screen height) for a face 0.14 wide. */
  radius: 0.06,
  /** Heat added per second at the centre of the impact. */
  heatRate: 6,
  /** The hottest a spot gets. */
  heatMax: 2,
  /** Heat above this chars the picture; char added per unit heat per second. */
  charFrom: 0.15,
  charRate: 2.4,
  /** How fast heat spreads to its neighbours (the edge creeps outward). */
  spread: 6,
  /** Seconds for heat to cool to about a third (embers glow, then fade). */
  cool: 1.1,
  /** Seconds for full char to fade back to the live picture once cooled. */
  charFade: 7,
  /** Char only fades once the heat there is below this. */
  fadeBelow: 0.35,
};

/** Sparks spraying from the impact point. */
export const SPARKS = {
  max: 260,
  /** Sparks per second at full beam. */
  rate: 150,
  /** Speed (screen heights per second), life (s), pull down (heights/s²). */
  speed: [0.25, 0.9] as const,
  life: [0.25, 0.7] as const,
  gravity: 1.5,
  /** Streak length (s of motion) and width (screen heights). */
  streak: 0.03,
  width: 0.0035,
};

/** Sound levels (all synthesised). */
export const SOUND = {
  master: 0.75,
  hum: 0.16,
  buzz: 0.07,
  sizzle: 0.08,
  charge: 0.22,
  crackle: 0.3,
  /** Pops per second at a full, fresh burn. */
  pops: 38,
};
