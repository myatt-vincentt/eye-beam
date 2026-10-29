// Sound on a tap. Until then a small glass speaker pulses low in the centre
// with a short caption; any tap starts the sound and the speaker fades away.
// Every frame the sound follows the beams: the charge, the beam tone, and
// the crackle of what it burns. The visuals never wait for it.
import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

import { sound } from "./audio";
import { live } from "./live";

const SIZE = 44;

const Glyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
    <path
      d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const PULSE = `
@keyframes eb-speaker-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 120, 40, 0); }
  50% { transform: scale(1.06); box-shadow: 0 0 18px 2px rgba(255, 120, 40, 0.45); }
}`;

/** The sound follows the beams every frame. */
const Follow = () => {
  const phase = useRef(live.fire.phase);
  const meter = useRef(0);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = live.fire.phase;
    if (now === "charging" && phase.current === "idle") sound.charge();
    phase.current = now;
    sound.update(live.power, live.burning, live.heat.fresh, dt);
    // The output level, for the dev readout (a few times a second).
    meter.current += dt;
    if (meter.current > 0.1) {
      meter.current = 0;
      const { rms, peak } = sound.levels();
      live.audio.on = sound.on;
      live.audio.rms = rms;
      live.audio.peak = Math.max(peak, live.audio.peak * 0.5);
    }
  });
  return null;
};

export const Sound = () => {
  const [on, setOn] = useState(false);
  const [gone, setGone] = useState(false);

  // Any tap starts the sound (the speaker is the visible invitation).
  useEffect(() => {
    if (on) return undefined;
    const start = () => {
      sound.unlock();
      setOn(true);
    };
    window.addEventListener("pointerdown", start, { once: true });
    return () => window.removeEventListener("pointerdown", start);
  }, [on]);

  useEffect(() => {
    if (!on) return undefined;
    const t = window.setTimeout(() => setGone(true), 450);
    return () => window.clearTimeout(t);
  }, [on]);

  return (
    <>
      <Follow />
      {gone ? null : (
        <Html
          fullscreen
          zIndexRange={[30, 0]}
          style={{ pointerEvents: "none" }}
        >
          <style>{PULSE}</style>
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              opacity: on ? 0 : 1,
              transition: "opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <button
              type="button"
              aria-label="Tap for sound"
              onClick={() => {
                sound.unlock();
                setOn(true);
              }}
              style={{
                pointerEvents: on ? "none" : "auto",
                width: SIZE,
                height: SIZE,
                borderRadius: SIZE / 2,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                background: "rgba(36, 14, 8, 0.45)",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                cursor: "pointer",
                padding: 0,
                animation: "eb-speaker-pulse 1.8s ease-out infinite",
              }}
            >
              <Glyph />
            </button>
            <span
              style={{
                font: '500 12px/1 "Space Grotesk", system-ui, sans-serif',
                letterSpacing: "0.02em",
                color: "rgba(255, 255, 255, 0.86)",
                textShadow: "0 1px 6px rgba(0, 0, 0, 0.55)",
                whiteSpace: "nowrap",
              }}
            >
              Tap for sound
            </span>
          </div>
        </Html>
      )}
    </>
  );
};
