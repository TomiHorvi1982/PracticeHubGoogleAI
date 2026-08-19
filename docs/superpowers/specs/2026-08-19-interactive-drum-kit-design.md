# Interactive Neon/Glass Drum Kit — Design Spec

Date: 2026-08-19
Status: Approved (ready for implementation plan)

## Problem

The "Nástroje & Synth" → drums module (`SampledDrumsStudio.tsx`) currently:

- Generates **all** drum sounds procedurally via Web Audio math in
  `SampledDrumEngine.ts` (`renderAcousticSampleBuffer`) — despite the class
  name, there are no real recorded samples anywhere in the repo (`assets/`,
  `data/` contain none). The result sounds synthetic, not like a real kit.
- Presents drum articulations as a flat grid of colored buttons/pads
  (`DRUM_PAD_GRID.map(...)`, MPC-pad style) — there is no graphical
  representation of a real drum kit, and no visual feedback showing which
  physical part of the kit is playing.

The user wants a look and feel closer to Addictive Drums / EZdrummer 3 /
Superior Drummer: a real, interactive drum kit graphic you can click to play
and that lights up to show what's sounding — plus the ability to load real
recorded samples instead of the synthetic ones.

## Goals

1. Replace the pad-grid playing surface with an **interactive SVG drum kit
   graphic** in a **Neon/Glass** visual style (dark glass shapes, glowing
   outlines in the app's existing orange/blue accent colors) that matches
   NeverLate Studio's current dark theme.
2. Clicking a physical part of the kit graphic triggers the correct sound
   **and articulation** via zone-based hit detection (e.g. snare
   center/edge/rim), exactly like AD/EZD/SD3.
3. Whichever articulation is currently sounding — whether triggered by a
   click or by the existing step sequencer during playback — causes that
   part of the kit graphic to visibly flash/glow, so the user can see what's
   playing in real time.
4. Let the user load their own real WAV recordings per articulation (already
   partially supported by the sample engine) through the existing upload UI,
   restyled to match, so any kit (including all 10 existing presets) can be
   upgraded from synthetic to real sound without further code changes.
5. Keep the existing step sequencer, mixer, humanize panel, and kit-preset
   switcher working exactly as they do today — this is a play-surface and
   visual replacement, not a rebuild of the audio engine.

## Non-Goals (explicitly out of scope)

- Bundling any third-party commercial sample library (Addictive Drums,
  EZdrummer, Superior Drummer, or any other licensed content). Real sound
  comes only from WAV files the user uploads themselves.
- Velocity-by-click-speed/position. Velocity stays controlled by the
  existing separate slider/preset control.
- Any change to `SampledDrumEngine`'s audio graph, mixer routing, EQ,
  compression, reverb, or humanize logic.
- Structural rework of `CustomDrumKitModal` upload flow — only a visual
  restyle to match the new Neon/Glass look.
- Per-kit custom graphics — one universal kit graphic/layout is used for all
  10 built-in kits and any custom/real-sample kit; only the *sound* differs
  per kit, not the drawing.

## Architecture

### New component: `DrumKitStage.tsx`

A new component under `src/components/` that renders the interactive SVG kit
and owns hit-zone geometry + pointer handling. It replaces the
`DRUM_PAD_GRID` grid section inside `SampledDrumsStudio.tsx`; everything else
in that file (kit selector, sequencer, mixer tabs, humanize panel, voice
history) stays as-is.

```
SampledDrumsStudio.tsx
 ├─ DrumKitStage.tsx           (NEW — replaces the pad-grid <div> block)
 │   ├─ zone hit-testing (per articulation, SVG path/shape based)
 │   ├─ hit flash/glow animation (driven by sampledDrumEngine voice events)
 │   └─ small "Percussion" strip (tambourine/cowbell/shaker/handclap)
 ├─ [unchanged] velocity slider / tier preset control
 ├─ [unchanged] 16-step sequencer grid
 ├─ [unchanged] mixer (faders / eq / fx tabs)
 └─ [unchanged] humanize panel, kit selector, custom kit modal trigger
```

`DrumKitStage` takes no new engine dependencies: it calls
`sampledDrumEngine.triggerPad(articulation, velocity)` on click (same call
the pad grid makes today) and subscribes to `sampledDrumEngine.subscribeVoice`
(already exists, already used for `voiceHistory`) to know when to flash a
zone — this covers both manual clicks and step-sequencer-triggered voices
with the same mechanism, so no new event plumbing is needed in the engine.

### Hit zones per kit piece

Each piece is one SVG shape group with one or more sub-regions mapped to a
`DrumArticulation` (values already defined in `SampledDrumEngine.ts`):

| Kit piece | Sub-zones → articulation |
|---|---|
| Kick | single zone → `kick` |
| Snare | center → `snare`, outer head ring → `snare_rimshot`, rim/hoop → `snare_sidestick` |
| Hi-hat cymbal | top/center → `hihat_closed`, outer edge → `hihat_open`, middle ring → `hihat_semi` |
| Hi-hat pedal (stand base) | single zone → `hihat_pedal` |
| Rack tom (high) | single zone → `tom_high` |
| Rack tom (mid) | single zone → `tom_mid` |
| Floor tom | single zone → `tom_low` |
| Crash (left) | single zone → `crash_left` |
| Crash (right) | single zone → `crash_right` |
| Ride | bow (outer) → `ride_bow`, bell (center) → `ride_bell` |
| China | single zone → `china` |
| Splash | single zone → `splash` |

Percussion (`tambourine`, `cowbell`, `shaker`, `handclap`) has no natural
place on a physical kit silhouette, so it's rendered as a small row of 4
compact glass/neon pads directly under the kit graphic — visually consistent
with the kit but clearly a separate "auxiliary" row, same as it's a separate
mixer channel (`percussion`) today.

Hit-zone shapes are plain SVG `<path>`/`<ellipse>` elements with `onClick`
handlers — no canvas, no hit-testing math beyond standard SVG event
dispatch, since SVG shapes natively capture pointer events within their
bounds.

### Visual style — Neon/Glass

- Dark glass panel shapes (`fill: rgba(...)` translucent dark, matching the
  app's existing panel/card background tokens) for kick/toms/snare bodies.
- Glowing stroke outlines using the app's existing accent colors (orange
  `#f5b942`/`#ff7a1a` family and blue `#3d63ff`/`#3ad1a0` family, consistent
  with the app's current dark theme — reuse existing Tailwind/CSS custom
  properties rather than introducing new hard-coded colors where equivalents
  already exist in the codebase).
- On trigger: the hit zone's stroke brightens and a brief radial glow/scale
  pulse plays (CSS animation, ~150-250ms), then fades back to idle — same
  treatment whether the trigger came from a click or from sequencer
  playback, since both go through `subscribeVoice`.
- Idle state: soft persistent outline glow (low opacity) so the kit reads
  clearly against the dark app background even at rest.

### Real sample integration

No engine changes required. `SampledDrumEngine` already resolves, per
`(kitId, articulation, velocityTier, roundRobin)`, real uploaded WAV buffers
before falling back to synthetic generation (`getSampleBuffer` → custom
buffer checks first, `renderAcousticSampleBuffer` last). `CustomDrumKitModal`
already provides per-articulation, per-velocity-tier, round-robin WAV
upload/recording UI wired to `sampledDrumEngine.loadCustomWavSample` /
`preloadCustomKit`.

Work here is limited to:
- A visual restyle pass on `CustomDrumKitModal` so it matches the new
  Neon/Glass look (dark glass cards, same accent colors) — no new fields,
  no new upload mechanics.
- Verifying the modal's entry point is easy to find from the new
  `DrumKitStage` view (e.g. a small "Load real samples" affordance near the
  kit, wired to the existing `onOpenCustomKitModal` prop already threaded
  through `SampledDrumsStudio`).

Once the user uploads a WAV for a given kit + articulation + tier, every kit
(including all 10 built-in presets) automatically plays that sample instead
of the synthetic render — this already works today via `kitId`-scoped
custom buffers; the new graphic doesn't change that behavior.

### Data flow (unchanged, for reference)

```
Click on kit zone / sequencer step fires
        │
        ▼
sampledDrumEngine.triggerPad(articulation, velocity, kitId)
        │
        ├─ resolves AudioBuffer: custom WAV (if uploaded) → synthetic fallback
        ├─ plays through existing per-instrument mixer channel
        └─ emits DrumVoiceEvent to subscribeVoice listeners
                        │
                        ▼
        DrumKitStage flashes the matching zone
```

## Testing / Verification

Manual verification in the browser preview (no dedicated test framework
exists for this UI today, consistent with the rest of the codebase):

1. Click every zone on the kit graphic and confirm the correct articulation
   sound plays (cross-check against `midiNoteToArticulation` mapping /
   console voice event log already surfaced in the UI).
2. Run the existing step sequencer at a few BPMs and confirm the kit graphic
   flashes are in sync with what's audibly playing, including for
   simultaneous hits (e.g. kick + closed hi-hat on the same step).
3. Switch between several of the 10 built-in kit presets and confirm the
   graphic stays identical while the sound changes.
4. Upload a real WAV sample via the restyled `CustomDrumKitModal` for one
   articulation and confirm it plays back in place of the synthetic sound,
   both via direct kit-graphic click and via the sequencer.
5. Confirm existing mixer/humanize/voice-history panels are functionally
   unaffected (no regressions from removing the pad grid).

## Open Questions

None — all scoping decisions were resolved during brainstorming (see
decisions log below).

## Decisions Log

- Visual style: **Neon/Glass**, matching the app's existing dark theme
  (chosen over Studio Photoreal and Flat Vector alternatives).
- Kit graphic **replaces** the pad grid entirely (not shown side-by-side).
- Articulation selection via **zone-based clicking** on the kit graphic
  (EZD/AD-style), not a separate variant switcher.
- Velocity stays on the **existing separate slider/preset**, not
  click-position/speed based.
- **One universal kit graphic** for all 10 built-in kits plus any real
  sample kit — only sound differs per kit, not the drawing.
- Real samples are sourced by **the user uploading their own WAV files**
  through the existing (restyled) upload modal — no bundled commercial or
  third-party sample library.
