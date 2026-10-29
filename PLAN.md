# Plan

Eye Beam: widen your eyes or raise your brows and two beams of heat shoot from
your eyes to where your head points, burning the camera picture like paper.
Endless: the burns cool and fade back to the live picture.

## How it works

- **Fire.** The face's blendshapes (both eyes wide, or brows raised) are scored
  against your resting face, learned in the first second and kept up to date
  from relaxed moments only. Holding the stare starts a short charge (the eyes
  glow brighter for 0.25 s), then the beams ignite; they keep firing while the
  stare holds and stop a moment after you relax (`src/beam/fire.ts`).
- **Aim with the head.** The target is the head's direction projected forward
  onto the screen: looking straight puts it in front of you, a little below
  your eyes; turning sweeps it across the screen. The impact drags slightly
  behind the head, so a sweep leaves a continuous trail (`src/beam/aim.ts`).
- **Beams.** Two screen-space beams from the iris centres to the impact: a
  white-hot core in a red-orange glow, flickering along their length, a bright
  flare where they hit, a warm glow on the face around the eyes, and heat
  shimmer along them.
- **Burn.** A half-resolution heat-and-char texture in screen space, so a burn
  stays where it was made while you move. The beam heats it along the impact's
  path; heat chars the picture; everything cools. The whole picture burns,
  you included: a white-yellow hot core, glowing orange edges where the char
  spreads, black-brown char with ragged burnt-paper edges, glowing ember cracks,
  faint smoke wisps above hot spots and sparks spraying from the impact. No
  holes, no melting.
- **Endless.** Embers fade over about 3 s, then the char lightens back to the
  live picture over about 7 s more. The rates are in `src/beam/config.ts`.
- **Sound.** Synthesised with Web Audio, through a compressor and a limiter: a
  charge-up hum, a sustained buzzing, sizzling beam tone, crackles where it
  burns (loudest on fresh picture) and a soft fade on stop. A small pulsing
  speaker low in the centre ("Tap for sound") starts it; any tap works.
- **Hint.** One wordless ghost face low in the centre widens its eyes and fires
  two tiny beams. It fades for good after the first fire.
- **Full screen.** The picture fills the whole window (`src/App.tsx` swaps the
  9:16 frame for a full-window container).

## Steps

1. Fire detection, head aim, beams, burn with all stages and cooling, sparks
   and smoke, sound, hint, dev keys. Done.
2. Polish after feedback.
