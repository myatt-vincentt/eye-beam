# Eye Beam

Heat beams from your eyes that burn the picture. Widen your eyes or raise your brows and, after a
short charge with your eyes glowing, two beams shoot from your eyes to wherever your head points.
Turn your head and they sweep across the screen, scorching the camera picture, you included,
like paper: a white-hot point at the beam tip, a thin ember line creeping out at the edge, black
char inside and a toasted brown halo around it, with sparks and thin smoke. Relax and the beams
stop; the embers fade, the char greys to ash and the picture comes back, so it never fills up.
Sound is synthesised and starts with a tap. The picture fills the whole screen.

- When it fires (`src/beam/fire.ts`, unit-tested): the brows raised or both eyes wide, scored
  against your resting face (learned in the first second and kept up to date from relaxed
  moments only), held for a moment to start and released a moment after you relax.
- Where it hits (`src/beam/aim.ts`, unit-tested): the head's turn from your usual pose, projected
  forward onto the screen; the impact drags a little behind, so a sweep leaves a trail.
- The burn is a half-resolution heat-and-char texture in screen space, drawn through one shader
  over the camera (`src/beam/BurnField.tsx`); the beams, sparks and sound are in `Beams.tsx`,
  `Sparks.tsx` and `audio.ts`. Every rate and size, cooling included, is in `src/beam/config.ts`.
- The hint is the SDK's ghost face (`public/models/face-v1.glb`), widening its eyes and firing two
  tiny beams; it leaves after the first fire. Credits in `CREDITS.md`.
- `src/App.tsx` uses a full-window container instead of the 9:16 frame; re-apply after a template
  upgrade.
- Dev preview without a camera: the media switcher starts on the SDK's sample video; hold F to
  fire, the arrow keys nudge the aim and 0 resets it; `window.__eyeBeam` has the live state. How
  it works: `PLAN.md`.

---

# v2-template

The Vincentt starter app: a real React + R3F + Vincentt XR SDK (`@vincentt-xr/sdk`)
WebXR app, bundled by esbuild.

## Shape

```
src/
  main.tsx            mount — never edited
  App.tsx             protected shell: XRProvider + AspectRatioContainer +
                      XRScene + media-source binding, camera, lighting,
                      VideoBackground, PreviewAnchors — never edited
  Scene.tsx           the agent's surface: add SDK components and R3F
                      primitives here
  PreviewAnchors.tsx  editor-preview integration — never edited
```

See `AGENTS.md` and `GROUNDING.md` for the API reference and how to author scenes.

## Develop

```
pnpm install
pnpm dev          # esbuild dev server on localhost:5173 (output in .dev/)
pnpm preview      # on-device preview over a secure tunnel (needs `vincentt login`)
pnpm typecheck
pnpm build        # production bundle to dist/
```

## Release

`vincentt init` scaffolds from the **`latest` tag**, not from `main`. Merging to `main` does
not ship a template to creators — cutting a release does.

```
git tag 1.1.0 <sha>      # bare semver, no `v` prefix
git push origin 1.1.0    # the Release workflow verifies the tag, then moves `latest`
```

The Release workflow (`.github/workflows/release.yml`) installs from the frozen lockfile,
builds, and typechecks **the tagged tree** before force-updating `latest` to it. A tag that
fails leaves `latest` where it was, so a broken release cannot reach a new creator.

The job runs in the `release` environment, which accepts bare-semver tags only. To re-run it by
hand, dispatch it from the tag itself ("Use workflow from: 1.1.0"); a dispatch from `main` is
refused.

**Never move `latest` by hand.** It is force-updated by that workflow and nowhere else; moving
it manually decouples the pointer from the version it claims to be.

Creators can pin a specific version — `vincentt init --template 1.0.0` — which is the escape
hatch when a release turns out to be bad. That is why the version tags are immutable and only
`latest` moves.

### `MIGRATION.md` and the platform release row

Root `MIGRATION.md` carries one entry per released tag, newest first, authored in the same
PR as the change: `required: true|false`, a one-line summary, and optional notes bullets.
`required: false` means no consumer action is needed, never that the entry was skipped. The
Release workflow refuses to move `latest` for a tag with no valid entry, then — once `latest`
has moved — posts that entry as this release's row to the platform (`POST
/platform/releases`, component `template`), via `scripts/release-row.mjs`. Both steps read
`MIGRATION.md` from `main`, not from the tagged tree: the note is reviewed via PR into `main`
and is append-only per version, so `main`'s copy is the reviewed source for any tag, including
one cut before this file existed. That row is what `vincentt outdated` reads back to tell a
creator's agent what changed and what to do about it.
