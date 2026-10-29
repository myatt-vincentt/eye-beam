// The sounds, synthesised (no files): a rising hum as the eyes charge, a
// sustained buzzing, sizzling beam tone while firing, crackles and pops
// where it burns (loudest on fresh picture), and a soft fade on stop. All
// through a compressor and a limiter, so stacked sounds stay at a safe
// level. Silent until a tap starts it (browsers only start audio on a tap).

import { SOUND } from "./config";

type Voices = {
  hum: GainNode;
  buzz: GainNode;
  sizzle: GainNode;
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let noise: AudioBuffer | null = null;
let voices: Voices | null = null;
let level: Float32Array<ArrayBuffer> | null = null;
let pops = 0;

const noiseBuffer = (c: AudioContext) => {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  return b;
};

const noiseSource = (c: AudioContext, loop = false) => {
  const s = c.createBufferSource();
  s.buffer = noise;
  s.loop = loop;
  return s;
};

const osc = (
  c: AudioContext,
  type: OscillatorType,
  f: number,
  to: AudioNode,
) => {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.connect(to);
  o.start();
  return o;
};

/** The beam's sustained voices, silent until it fires. */
const startVoices = (c: AudioContext, out: AudioNode): Voices => {
  // Low hum: two detuned saws through a resonant low-pass.
  const hum = c.createGain();
  hum.gain.value = 0;
  const low = c.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 480;
  low.Q.value = 4;
  osc(c, "sawtooth", 58, low);
  osc(c, "sawtooth", 87.4, low);
  low.connect(hum).connect(out);

  // Buzz: a bright band of saw and square, trembling fast.
  const buzz = c.createGain();
  buzz.gain.value = 0;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1400;
  band.Q.value = 1.5;
  const tremble = c.createGain();
  tremble.gain.value = 0.6;
  const depth = c.createGain();
  depth.gain.value = 0.4;
  depth.connect(tremble.gain);
  osc(c, "sine", 37, depth);
  const a = osc(c, "sawtooth", 174, band);
  const b = osc(c, "square", 233, band);
  // A slow wobble in pitch so it never sounds like a test tone.
  const wobDepth = c.createGain();
  wobDepth.gain.value = 4;
  osc(c, "sine", 5.3, wobDepth);
  wobDepth.connect(a.frequency);
  wobDepth.connect(b.frequency);
  band.connect(tremble).connect(buzz).connect(out);

  // Sizzle: hissing noise, high and airy.
  const sizzle = c.createGain();
  sizzle.gain.value = 0;
  const hiss = noiseSource(c, true);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2600;
  const air = c.createBiquadFilter();
  air.type = "peaking";
  air.frequency.value = 6500;
  air.gain.value = 6;
  hiss.connect(hp).connect(air).connect(sizzle).connect(out);
  hiss.start();
  return { hum, buzz, sizzle };
};

const ensure = () => {
  if (ctx) return ctx;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  ctx = new AC();
  noise = noiseBuffer(ctx);
  master = ctx.createGain();
  master.gain.value = SOUND.master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -4;
  limit.knee.value = 0;
  limit.ratio.value = 20;
  limit.attack.value = 0.001;
  limit.release.value = 0.08;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  level = new Float32Array(analyser.fftSize);
  master
    .connect(comp)
    .connect(limit)
    .connect(analyser)
    .connect(ctx.destination);
  voices = startVoices(ctx, master);
  return ctx;
};

/** One crackle: a tiny burst of filtered noise. */
const pop = (c: AudioContext, out: AudioNode, loud: number) => {
  if (pops > 24) return;
  pops += 1;
  const t = c.currentTime + Math.random() * 0.02;
  const len = 0.004 + Math.random() * 0.018;
  const src = noiseSource(c);
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1500 + Math.random() * 4500;
  band.Q.value = 1 + Math.random() * 2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, loud), t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.03);
  src.connect(band).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + len + 0.05);
  src.onended = () => {
    pops -= 1;
    g.disconnect();
  };
};

export const sound = {
  get on() {
    return !!ctx && ctx.state === "running";
  },
  /** Start the sound (call from a tap). */
  unlock() {
    ensure()
      .resume()
      .catch(() => {});
  },
  /** The charge-up: a hum rising fast in pitch, with a hiss riser. */
  charge() {
    if (!ctx || !master || ctx.state !== "running") return;
    const c = ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(560, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(SOUND.charge, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.5);
    const n = noiseSource(c);
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 3;
    band.frequency.setValueAtTime(700, t);
    band.frequency.exponentialRampToValueAtTime(4200, t + 0.3);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(SOUND.charge * 0.5, t + 0.24);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.connect(band).connect(ng).connect(master);
    n.start(t);
    n.stop(t + 0.45);
  },
  /**
   * Every frame: `power` the beam (0 … 1), `burning` whether it hits,
   * `fresh` how fresh the picture under it is (0 … 1).
   */
  update(power: number, burning: boolean, fresh: number, dt: number) {
    if (!ctx || !voices || !master || ctx.state !== "running") return;
    const c = ctx;
    const t = c.currentTime;
    // Quick in, soft out.
    const tau = power > 0.5 ? 0.03 : 0.12;
    const burn = burning ? power : 0;
    voices.hum.gain.setTargetAtTime(SOUND.hum * power, t, tau);
    voices.buzz.gain.setTargetAtTime(SOUND.buzz * power, t, tau);
    voices.sizzle.gain.setTargetAtTime(
      SOUND.sizzle * (0.35 * power + 0.9 * burn * fresh),
      t,
      tau,
    );
    // Crackles: a random scatter, more and louder on fresh picture.
    let due = SOUND.pops * burn * (0.25 + fresh) * dt;
    while (due > 0) {
      if (Math.random() < Math.min(1, due))
        pop(
          c,
          master,
          SOUND.crackle * (0.3 + 0.7 * fresh) * (0.4 + 0.6 * Math.random()),
        );
      due -= 1;
    }
  },
  /** The output level right now (rms and peak, 0 … 1). */
  levels() {
    if (!analyser || !level) return { rms: 0, peak: 0 };
    analyser.getFloatTimeDomainData(level);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < level.length; i += 1) {
      const v = Math.abs(level[i]);
      sum += v * v;
      if (v > peak) peak = v;
    }
    return { rms: Math.sqrt(sum / level.length), peak };
  },
};
