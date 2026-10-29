# Plan

Eye Beam: widen your eyes or raise your brows and two beams of heat shoot from your eyes to where
your head points, scorching the camera picture like paper. Endless: every burn cools and fades
back to the live picture.

## How it works

- **Fire.** The brows raised, or both eyes wide, scored against your resting face. The resting
  face is learned in the first second and keeps learning from relaxed moments only, so a held
  stare never becomes the new rest. The stare must hold for a moment to start (hysteresis keeps
  it firing through small dips) and the beams stop a moment after you relax. The eyes glow
  brighter for a quarter second, then the beams ignite. Raised brows are the main trigger: the
  face model reads wide eyes only weakly.
- **Aim with the head.** The target is the head's turn from your usual pose (learned while the
  beams are off, so a phone held low still aims ahead), projected forward onto the screen.
  Looking straight puts it in front of you, a little below your eyes; turning sweeps it across
  the screen. The impact drags slightly behind the head, so a sweep leaves a continuous trail.
- **Beams.** Two beams in screen space from the iris centres to the impact: a white-hot core in
  a red-orange glow, flickering along their length, heat shimmer around them, a small flare
  where they hit and a warm glow on the face around the eyes.
- **Burn.** A half-resolution heat-and-char texture in screen space, so a burn stays where it
  was made while you move. The beam heats it along the impact's path, heat spreads a little so
  the edge creeps outward, and heat chars the picture. The whole picture burns, you included,
  like scorched paper or film:
  - at the beam tip, a small white-yellow point with a thin orange ring;
  - at the edge, a thin, ragged orange ember line with tiny flecks just past it;
  - inside, matte black char with grey ash mottling, fine cracks and flakes, and a curled lip
    (a lighter rim with a shadow just inside it);
  - outside, the picture heat-browned from dark brown to caramel to tan, with a paper grain;
  - thin grey smoke rising from the hot edge, and sparks spraying from the impact.
- **Cooling.** The ember line fades first (about 2 s), then the char greys to ash and the scorch
  fades back to the live picture (gone by about 8–10 s). The rates are in `src/beam/config.ts`.
- **Sound.** Synthesised with Web Audio, through a compressor and a limiter: a charge-up hum, a
  sustained buzzing, sizzling beam tone, crackles where it burns (loudest on fresh picture) and a
  soft fade on stop. A small pulsing speaker low in the centre, captioned "Tap for sound", starts
  it; any tap works.
- **Hint.** One wordless ghost face low in the centre widens its eyes and fires two tiny beams.
  It fades for good after the first fire.
- **Full screen.** The picture fills the whole window (`src/App.tsx` swaps the 9:16 frame for a
  full-window container).
