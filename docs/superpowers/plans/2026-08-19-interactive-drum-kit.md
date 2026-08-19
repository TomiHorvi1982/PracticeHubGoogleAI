# Interactive Neon/Glass Drum Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the drum module's flat pad-grid playing surface with an interactive, zone-based SVG drum kit graphic in a Neon/Glass visual style, and make it trivial for the user to upgrade any kit from synthetic sound to their own real WAV recordings.

**Architecture:** A new `DrumKitStage` component (plus small supporting data/hook files under `src/components/drumkit/`) renders the kit as layered SVG ellipses per articulation and calls the same `sampledDrumEngine.triggerPad` entry point the old pad grid used. It subscribes to the engine's existing voice-event stream to flash whichever part just sounded — whether triggered by a click or by the step sequencer — with zero changes to `SampledDrumEngine` itself. Real-sample loading reuses the existing `CustomDrumKitModal` upload pipeline unchanged, with a light visual restyle pass for consistency.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4 (utility classes, no CSS-in-JS), inline SVG (no canvas/WebGL), Web Audio API via the existing `SampledDrumEngine` singleton. No test runner exists in this repo — verification is manual, via the browser preview tool, following the pattern already used for this codebase.

## Global Constraints

- No third-party commercial sample library may be bundled — real sound comes only from WAV files the user uploads via `CustomDrumKitModal` (spec Non-Goals).
- No changes to `SampledDrumEngine`'s audio graph, mixer routing, EQ, compression, reverb, or humanize logic (spec Non-Goals).
- No velocity-by-click-position/speed — velocity stays on the existing separate slider/preset control (spec Decisions Log).
- One universal kit graphic for all 10 built-in kits plus any custom/real-sample kit — only the sound differs per kit, not the drawing (spec Decisions Log).
- Zone-based articulation selection on the kit graphic (EZD/AD-style), kit graphic **replaces** the pad grid entirely — it is not shown side-by-side with it (spec Decisions Log).
- Visual style is Neon/Glass, reusing the app's existing dark theme and accent colors rather than introducing a new palette (spec Visual style section).

---

## File Structure

```
src/data/drumPadDefinitions.ts        (NEW) — shared PadTriggerDef type + DRUM_PAD_GRID metadata
                                                (extracted out of SampledDrumsStudio.tsx so both the
                                                stage and the keyboard-shortcut handler can use it)

src/components/drumkit/
  drumKitZones.ts                     (NEW) — pure geometry + color data: which SVG shapes exist,
                                                where they sit, what category color they glow
  useDrumHitFlash.ts                  (NEW) — hook: subscribes to engine voice events, returns a
                                                per-articulation "flash generation" counter
  DrumKitStage.tsx                    (NEW) — renders the SVG kit + percussion row, wires clicks
                                                to onTriggerPad, renders hit-flash overlays

src/components/SampledDrumsStudio.tsx (MODIFY) — import DRUM_PAD_GRID from the new data file instead
                                                of defining it locally; replace the pad-grid <div>
                                                block with <DrumKitStage />

src/components/CustomDrumKitModal.tsx (MODIFY) — visual-only restyle of two spots (articulation
                                                selector strip, pad upload slot cards) to use the
                                                shared category glow colors from drumKitZones.ts

src/index.css                         (MODIFY) — add the hitFlash keyframes + .drum-zone-hit utility
                                                class, following the file's existing keyframe pattern
```

---

### Task 1: Extract shared drum pad metadata into its own data file

**Files:**
- Create: `src/data/drumPadDefinitions.ts`
- Modify: `src/components/SampledDrumsStudio.tsx:1-80`

**Interfaces:**
- Produces: `PadTriggerDef` interface, `DRUM_PAD_GRID: PadTriggerDef[]` constant — both imported by `DrumKitStage.tsx` (Task 5) and used by `SampledDrumsStudio.tsx`'s keyboard-shortcut handler.

This is a pure extraction — no behavior changes. It exists so the new `DrumKitStage` component can reuse the same articulation metadata (Czech names, key labels, MIDI notes, icons, categories) that `SampledDrumsStudio.tsx` already defines, instead of duplicating it.

- [ ] **Step 1: Create the new data file with the extracted content**

Create `src/data/drumPadDefinitions.ts`:

```ts
import { DrumArticulation } from '../services/SampledDrumEngine';

export interface PadTriggerDef {
  id: DrumArticulation;
  name: string;
  czName: string;
  keyLabel: string;
  category: 'kick' | 'snare' | 'hihat' | 'toms' | 'cymbals' | 'perc';
  icon: string;
  midiNote: number;
}

export const DRUM_PAD_GRID: PadTriggerDef[] = [
  // Kick & Snares
  { id: 'kick', name: 'Kick Drum', czName: 'Kopák (Center)', keyLabel: 'Q', category: 'kick', icon: '🥁', midiNote: 36 },
  { id: 'snare', name: 'Snare Center', czName: 'Virbl (Střed)', keyLabel: 'W', category: 'snare', icon: '🪘', midiNote: 38 },
  { id: 'snare_rimshot', name: 'Snare Rimshot', czName: 'Virbl (Rimshot)', keyLabel: 'E', category: 'snare', icon: '💥', midiNote: 40 },
  { id: 'snare_sidestick', name: 'Snare Cross-Stick', czName: 'Virbl (Side-Stick)', keyLabel: 'R', category: 'snare', icon: '🪵', midiNote: 37 },

  // Hi-Hats
  { id: 'hihat_closed', name: 'Hi-Hat Closed', czName: 'Hi-Hat (Zavřená)', keyLabel: 'A', category: 'hihat', icon: '🪙', midiNote: 42 },
  { id: 'hihat_semi', name: 'Hi-Hat Semi-Open', czName: 'Hi-Hat (Polootevřená)', keyLabel: 'S', category: 'hihat', icon: '✨', midiNote: 23 },
  { id: 'hihat_open', name: 'Hi-Hat Open', czName: 'Hi-Hat (Otevřená)', keyLabel: 'D', category: 'hihat', icon: '🌟', midiNote: 46 },
  { id: 'hihat_pedal', name: 'Hi-Hat Pedal Chick', czName: 'Hi-Hat (Pedál)', keyLabel: 'F', category: 'hihat', icon: '🦶', midiNote: 44 },

  // Toms
  { id: 'tom_high', name: 'High Rack Tom', czName: 'Malý přechod 10"', keyLabel: 'T', category: 'toms', icon: '🪘', midiNote: 48 },
  { id: 'tom_mid', name: 'Mid Rack Tom', czName: 'Střední přechod 12"', keyLabel: 'Y', category: 'toms', icon: '🪘', midiNote: 45 },
  { id: 'tom_low', name: 'Floor Tom', czName: 'Kotel 16"', keyLabel: 'U', category: 'toms', icon: '🥁', midiNote: 41 },

  // Cymbals
  { id: 'crash_left', name: 'Crash Cymbal 16"', czName: 'Crash činel 16"', keyLabel: 'G', category: 'cymbals', icon: '💥', midiNote: 49 },
  { id: 'crash_right', name: 'Crash Cymbal 18"', czName: 'Crash činel 18"', keyLabel: 'H', category: 'cymbals', icon: '⚡', midiNote: 57 },
  { id: 'ride_bow', name: 'Ride Cymbal (Bow)', czName: 'Ride (Tělo)', keyLabel: 'J', category: 'cymbals', icon: '🛸', midiNote: 51 },
  { id: 'ride_bell', name: 'Ride Cymbal (Bell)', czName: 'Ride (Zvon)', keyLabel: 'K', category: 'cymbals', icon: '🔔', midiNote: 53 },
  { id: 'china', name: 'China Cymbal', czName: 'China činel', keyLabel: 'L', category: 'cymbals', icon: '🔥', midiNote: 52 },
  { id: 'splash', name: 'Splash Cymbal', czName: 'Splash činel', keyLabel: 'Z', category: 'cymbals', icon: '💦', midiNote: 55 },

  // Percussion
  { id: 'tambourine', name: 'Tambourine', czName: 'Tamburína', keyLabel: 'X', category: 'perc', icon: '🪇', midiNote: 54 },
  { id: 'cowbell', name: 'Cowbell', czName: 'Kravský zvonec', keyLabel: 'C', category: 'perc', icon: '🛎️', midiNote: 56 },
  { id: 'shaker', name: 'Studio Shaker', czName: 'Šejkr', keyLabel: 'V', category: 'perc', icon: '🧂', midiNote: 69 },
  { id: 'handclap', name: 'Hand Clap', czName: 'Tlesknutí', keyLabel: 'B', category: 'perc', icon: '👏', midiNote: 39 },
];
```

- [ ] **Step 2: Replace the local definitions in `SampledDrumsStudio.tsx` with an import**

In `src/components/SampledDrumsStudio.tsx`, delete lines 39-80 (the local `PadTriggerDef` interface and `DRUM_PAD_GRID` array) and add this import near the top of the file, alongside the other local imports (after the `CustomDrumKit` import, around line 14):

```ts
import { DRUM_PAD_GRID } from '../data/drumPadDefinitions';
```

The rest of the file (`DRUM_PAD_GRID.find(...)` in the keyboard handler, etc.) is unchanged — it already refers to `DRUM_PAD_GRID` by name, so it now resolves to the imported constant instead of the local one.

- [ ] **Step 3: Verify the app still builds**

Run: `npm run lint`
Expected: exits with no TypeScript errors (this project uses `tsc --noEmit` as its "lint" script — see `package.json`).

- [ ] **Step 4: Manually verify no behavior changed**

Start the dev server and confirm the drum module still loads and keyboard shortcuts (Q, W, E, R...) still trigger pads exactly as before — this step is pure extraction, so the pad grid should look and behave identically.

Run: use the `preview_start` tool with the `neverlatestudio-dev` launch config already set up in `.claude/launch.json` (or `bun run dev` directly), open the app, navigate to Nástroje & Synth → the sampled drum engine tab, and press a few of the mapped keys.
Expected: pads still trigger sounds exactly as before this change.

- [ ] **Step 5: Commit**

```bash
git add src/data/drumPadDefinitions.ts src/components/SampledDrumsStudio.tsx
git commit -m "refactor: extract drum pad metadata into shared data file"
```

---

### Task 2: Add the hit-flash CSS animation

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Produces: `.drum-zone-hit` CSS class (animation-only, no JS API) — applied by `DrumKitStage.tsx` (Task 5) to a freshly-keyed overlay element on every drum hit.

- [ ] **Step 1: Add the keyframes and utility class**

In `src/index.css`, add this block right after the existing `.animate-pulse-soft` rule (after line 46, before the `/* Apple Pro refined scrollbar */` comment):

```css
/* Drum kit hit-flash — a keyed element replays this once per trigger */
@keyframes hitFlash {
  0% { opacity: 0.9; }
  100% { opacity: 0; }
}

.drum-zone-hit {
  animation: hitFlash 220ms ease-out forwards;
  pointer-events: none;
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run lint`
Expected: exits with no TypeScript errors (this change is CSS-only, so this step just confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: add drum kit hit-flash animation"
```

---

### Task 3: Define the kit's SVG zone geometry and category colors

**Files:**
- Create: `src/components/drumkit/drumKitZones.ts`

**Interfaces:**
- Consumes: `DrumArticulation` type from `src/services/SampledDrumEngine.ts` (already exported there).
- Produces: `PadCategory` type, `ZONE_CATEGORY_GLOW: Record<PadCategory, string>`, `HIT_FLASH_COLOR: string`, `DrumZoneShape` interface, `KitPieceGroup` interface, `KIT_PIECE_GROUPS: KitPieceGroup[]`, `KIT_VIEWBOX: string` — all consumed by `DrumKitStage.tsx` (Task 5) and `ZONE_CATEGORY_GLOW` additionally consumed by `CustomDrumKitModal.tsx` (Task 8).

This file is pure data — no React, no DOM — so it's easy to read and tweak layout numbers in isolation from rendering logic.

- [ ] **Step 1: Create the file**

Create `src/components/drumkit/drumKitZones.ts`:

```ts
import { DrumArticulation } from '../../services/SampledDrumEngine';

export type PadCategory = 'kick' | 'snare' | 'hihat' | 'toms' | 'cymbals' | 'perc';

/** Category → idle glow / border color, reused by DrumKitStage and CustomDrumKitModal. */
export const ZONE_CATEGORY_GLOW: Record<PadCategory, string> = {
  kick: '#60A5FA',
  snare: '#FBBF24',
  hihat: '#34D399',
  toms: '#C084FC',
  cymbals: '#FACC15',
  perc: '#94A3B8',
};

/** Color used for the brief flash overlay when any part of the kit is triggered. */
export const HIT_FLASH_COLOR = '#FF9F0A';

export type DrumZoneCategory = Exclude<PadCategory, 'perc'>;

export interface DrumZoneShape {
  articulation: DrumArticulation;
  category: DrumZoneCategory;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface DecorativeShape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  opacity?: number;
}

export interface KitPieceGroup {
  id: string;
  /** Non-interactive shapes drawn for visual detail (drum head highlight, beater hole, etc). */
  decorative?: DecorativeShape[];
  /** Ordered bottom → top. Later entries paint on top and win pointer hit-tests inside their bounds. */
  zones: DrumZoneShape[];
}

export const KIT_VIEWBOX = '0 0 760 480';

export const KIT_PIECE_GROUPS: KitPieceGroup[] = [
  {
    id: 'hihat',
    zones: [
      { articulation: 'hihat_open', category: 'hihat', cx: 100, cy: 245, rx: 64, ry: 13 },
      { articulation: 'hihat_semi', category: 'hihat', cx: 100, cy: 245, rx: 48, ry: 10 },
      { articulation: 'hihat_closed', category: 'hihat', cx: 100, cy: 245, rx: 32, ry: 7 },
    ],
  },
  {
    id: 'hihat_pedal',
    zones: [{ articulation: 'hihat_pedal', category: 'hihat', cx: 100, cy: 430, rx: 30, ry: 10 }],
  },
  {
    id: 'china',
    zones: [{ articulation: 'china', category: 'cymbals', cx: 195, cy: 55, rx: 42, ry: 9 }],
  },
  {
    id: 'crash_left',
    zones: [{ articulation: 'crash_left', category: 'cymbals', cx: 250, cy: 75, rx: 76, ry: 15 }],
  },
  {
    id: 'snare',
    zones: [
      { articulation: 'snare_sidestick', category: 'snare', cx: 230, cy: 300, rx: 56, ry: 33 },
      { articulation: 'snare_rimshot', category: 'snare', cx: 230, cy: 300, rx: 43, ry: 24 },
      { articulation: 'snare', category: 'snare', cx: 230, cy: 300, rx: 29, ry: 16 },
    ],
  },
  {
    id: 'tom_high',
    decorative: [{ cx: 360, cy: 141, rx: 54, ry: 15, fill: '#e9e6df', opacity: 0.15 }],
    zones: [{ articulation: 'tom_high', category: 'toms', cx: 360, cy: 155, rx: 54, ry: 31 }],
  },
  {
    id: 'tom_mid',
    decorative: [{ cx: 470, cy: 145, rx: 60, ry: 16, fill: '#e9e6df', opacity: 0.15 }],
    zones: [{ articulation: 'tom_mid', category: 'toms', cx: 470, cy: 160, rx: 60, ry: 34 }],
  },
  {
    id: 'splash',
    zones: [{ articulation: 'splash', category: 'cymbals', cx: 545, cy: 52, rx: 34, ry: 8 }],
  },
  {
    id: 'crash_right',
    zones: [{ articulation: 'crash_right', category: 'cymbals', cx: 610, cy: 50, rx: 58, ry: 11 }],
  },
  {
    id: 'ride',
    zones: [
      { articulation: 'ride_bow', category: 'cymbals', cx: 660, cy: 95, rx: 90, ry: 18 },
      { articulation: 'ride_bell', category: 'cymbals', cx: 660, cy: 95, rx: 18, ry: 18 },
    ],
  },
  {
    id: 'kick',
    decorative: [{ cx: 460, cy: 345, rx: 22, ry: 22, fill: '#0a0a0a', opacity: 0.6 }],
    zones: [{ articulation: 'kick', category: 'kick', cx: 460, cy: 345, rx: 145, ry: 88 }],
  },
  {
    id: 'tom_low',
    zones: [{ articulation: 'tom_low', category: 'toms', cx: 640, cy: 330, rx: 74, ry: 44 }],
  },
];
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run lint`
Expected: exits with no TypeScript errors. (This file isn't imported anywhere yet, so this just confirms the file itself is valid TypeScript.)

- [ ] **Step 3: Commit**

```bash
git add src/components/drumkit/drumKitZones.ts
git commit -m "feat: add drum kit SVG zone geometry data"
```

---

### Task 4: Add the hit-flash tracking hook

**Files:**
- Create: `src/components/drumkit/useDrumHitFlash.ts`

**Interfaces:**
- Consumes: `sampledDrumEngine.subscribeVoice(cb): () => void` and `DrumArticulation` type, both from `src/services/SampledDrumEngine.ts` (already implemented there — see `subscribeVoice` at line 265 and the `DrumVoiceEvent.articulation` field).
- Produces: `useDrumHitFlash(): Partial<Record<DrumArticulation, number>>` — consumed by `DrumKitStage.tsx` (Task 5).

- [ ] **Step 1: Create the hook**

Create `src/components/drumkit/useDrumHitFlash.ts`:

```ts
import { useEffect, useState } from 'react';
import { sampledDrumEngine, DrumArticulation } from '../../services/SampledDrumEngine';

/**
 * Tracks a per-articulation "flash generation" counter that increments every
 * time that articulation is triggered — by a direct click OR by the step
 * sequencer, since both paths go through sampledDrumEngine.triggerPad and
 * emit the same voice event.
 *
 * Consumers key a wrapper element on `flashKeys[articulation]` so React
 * remounts it on every hit, restarting its CSS hit-flash animation even if
 * the same pad is hit again before the previous animation finished.
 */
export function useDrumHitFlash(): Partial<Record<DrumArticulation, number>> {
  const [flashKeys, setFlashKeys] = useState<Partial<Record<DrumArticulation, number>>>({});

  useEffect(() => {
    const unsubscribe = sampledDrumEngine.subscribeVoice((event) => {
      setFlashKeys((prev) => ({
        ...prev,
        [event.articulation]: (prev[event.articulation] || 0) + 1,
      }));
    });
    return unsubscribe;
  }, []);

  return flashKeys;
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run lint`
Expected: exits with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/drumkit/useDrumHitFlash.ts
git commit -m "feat: add useDrumHitFlash hook for kit-graphic hit feedback"
```

---

### Task 5: Build the `DrumKitStage` component

**Files:**
- Create: `src/components/drumkit/DrumKitStage.tsx`

**Interfaces:**
- Consumes: `DRUM_PAD_GRID` from `src/data/drumPadDefinitions.ts` (Task 1); `KIT_PIECE_GROUPS`, `ZONE_CATEGORY_GLOW`, `HIT_FLASH_COLOR`, `KIT_VIEWBOX` from `./drumKitZones` (Task 3); `useDrumHitFlash` from `./useDrumHitFlash` (Task 4); `.drum-zone-hit` CSS class (Task 2); `DrumArticulation` type from `src/services/SampledDrumEngine.ts`.
- Produces: `DrumKitStage` component with props `{ onTriggerPad: (articulation: DrumArticulation) => void }` — consumed by `SampledDrumsStudio.tsx` (Task 6).

- [ ] **Step 1: Create the component**

Create `src/components/drumkit/DrumKitStage.tsx`:

```tsx
import React from 'react';
import { DrumArticulation } from '../../services/SampledDrumEngine';
import { DRUM_PAD_GRID } from '../../data/drumPadDefinitions';
import {
  KIT_PIECE_GROUPS,
  ZONE_CATEGORY_GLOW,
  HIT_FLASH_COLOR,
  KIT_VIEWBOX,
} from './drumKitZones';
import { useDrumHitFlash } from './useDrumHitFlash';

interface DrumKitStageProps {
  onTriggerPad: (articulation: DrumArticulation) => void;
}

const PERCUSSION_PADS = DRUM_PAD_GRID.filter((p) => p.category === 'perc');

export const DrumKitStage: React.FC<DrumKitStageProps> = ({ onTriggerPad }) => {
  const flashKeys = useDrumHitFlash();

  return (
    <div className="space-y-3">
      <div className="relative bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-5 overflow-hidden">
        <svg
          viewBox={KIT_VIEWBOX}
          className="w-full h-auto select-none"
          role="img"
          aria-label="Interaktivní bicí souprava"
        >
          {/* Hi-hat stand pole — decorative, non-interactive */}
          <line x1="100" y1="258" x2="100" y2="420" stroke="#3a3f52" strokeWidth="4" />

          {KIT_PIECE_GROUPS.map((group) => (
            <g key={group.id}>
              {group.decorative?.map((d, i) => (
                <ellipse
                  key={i}
                  cx={d.cx}
                  cy={d.cy}
                  rx={d.rx}
                  ry={d.ry}
                  fill={d.fill}
                  opacity={d.opacity ?? 1}
                  pointerEvents="none"
                />
              ))}

              {group.zones.map((zone) => {
                const glow = ZONE_CATEGORY_GLOW[zone.category];
                const padMeta = DRUM_PAD_GRID.find((p) => p.id === zone.articulation);
                const flashKey = flashKeys[zone.articulation];

                return (
                  <g key={zone.articulation}>
                    <ellipse
                      cx={zone.cx}
                      cy={zone.cy}
                      rx={zone.rx}
                      ry={zone.ry}
                      fill="rgba(20,22,32,0.85)"
                      stroke={glow}
                      strokeOpacity={0.6}
                      strokeWidth={2}
                      className="cursor-pointer"
                      onClick={() => onTriggerPad(zone.articulation)}
                    >
                      <title>{padMeta ? `${padMeta.czName} (${padMeta.keyLabel})` : zone.articulation}</title>
                    </ellipse>

                    {flashKey ? (
                      <ellipse
                        key={`flash-${flashKey}`}
                        cx={zone.cx}
                        cy={zone.cy}
                        rx={zone.rx}
                        ry={zone.ry}
                        fill={HIT_FLASH_COLOR}
                        className="drum-zone-hit"
                      />
                    ) : null}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      {/* Auxiliary percussion row — tambourine/cowbell/shaker/handclap don't sit on a
          physical kit silhouette, so they get their own compact glass/neon row. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {PERCUSSION_PADS.map((pad) => {
          const flashKey = flashKeys[pad.id];
          const glow = ZONE_CATEGORY_GLOW[pad.category];

          return (
            <button
              key={pad.id}
              onClick={() => onTriggerPad(pad.id)}
              style={{ borderColor: `${glow}40` }}
              className="relative flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-black/50 hover:bg-black/30 text-left transition-all active:scale-95 cursor-pointer select-none overflow-hidden"
            >
              {flashKey ? (
                <span
                  key={`flash-${flashKey}`}
                  style={{ backgroundColor: HIT_FLASH_COLOR }}
                  className="absolute inset-0 drum-zone-hit"
                />
              ) : null}
              <span className="relative text-base">{pad.icon}</span>
              <span className="relative flex-1 text-[11px] font-bold text-white truncate">{pad.czName}</span>
              <span className="relative px-1.5 py-0.5 bg-black/80 border border-white/20 text-[#FF9F0A] font-mono text-[9px] font-black rounded uppercase">
                {pad.keyLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run lint`
Expected: exits with no TypeScript errors. (Not wired into the UI yet, so this only validates the component's own types.)

- [ ] **Step 3: Commit**

```bash
git add src/components/drumkit/DrumKitStage.tsx
git commit -m "feat: add interactive Neon/Glass DrumKitStage component"
```

---

### Task 6: Wire `DrumKitStage` into `SampledDrumsStudio.tsx`, replacing the pad grid

**Files:**
- Modify: `src/components/SampledDrumsStudio.tsx:402-490`

**Interfaces:**
- Consumes: `DrumKitStage` component from `./drumkit/DrumKitStage` (Task 5), props `{ onTriggerPad }`; existing local `handleTriggerPad(articulation, velocity?)` function (already defined at line 181, unchanged).

- [ ] **Step 1: Add the import**

In `src/components/SampledDrumsStudio.tsx`, add this import near the top of the file, after the `CustomDrumKit` import:

```ts
import { DrumKitStage } from './drumkit/DrumKitStage';
```

- [ ] **Step 2: Replace the pad-grid section with `DrumKitStage`**

Find this block (originally lines 402-490 — the header text and velocity-tier selector stay exactly as they are; only the `{/* Drum Pads Grid */}` grid `<div>` at the end is replaced):

```tsx
        {/* Drum Pads Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {DRUM_PAD_GRID.map((pad) => {
            const isJustTriggered = activeVoiceEvent?.articulation === pad.id;

            return (
              <button
                key={pad.id}
                onClick={() => handleTriggerPad(pad.id)}
                className={`relative group flex flex-col justify-between p-3.5 h-28 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer shadow-lg select-none ${
                  isJustTriggered
                    ? 'bg-gradient-to-br from-[#FF9F0A]/30 to-orange-950/40 border-[#FF9F0A] shadow-[0_0_20px_rgba(255,159,10,0.4)] ring-2 ring-[#FF9F0A]'
                    : pad.category === 'kick'
                    ? 'bg-gradient-to-b from-blue-950/30 to-black/60 border-blue-500/20 hover:border-blue-400/50'
                    : pad.category === 'snare'
                    ? 'bg-gradient-to-b from-amber-950/30 to-black/60 border-amber-500/20 hover:border-amber-400/50'
                    : pad.category === 'hihat'
                    ? 'bg-gradient-to-b from-emerald-950/30 to-black/60 border-emerald-500/20 hover:border-emerald-400/50'
                    : pad.category === 'toms'
                    ? 'bg-gradient-to-b from-purple-950/30 to-black/60 border-purple-500/20 hover:border-purple-400/50'
                    : pad.category === 'cymbals'
                    ? 'bg-gradient-to-b from-yellow-950/30 to-black/60 border-yellow-500/20 hover:border-yellow-400/50'
                    : 'bg-gradient-to-b from-neutral-900/60 to-black/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg">{pad.icon}</span>
                  <span className="px-2 py-0.5 bg-black/80 border border-white/20 text-[#FF9F0A] font-mono text-[10px] font-black rounded-lg uppercase shadow-inner">
                    {pad.keyLabel}
                  </span>
                </div>

                <div>
                  <div className="text-[12px] font-bold text-white truncate group-hover:text-[#FF9F0A] transition-colors">
                    {pad.czName}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate flex items-center justify-between">
                    <span>{pad.name}</span>
                    <span className="text-[9px] font-mono text-neutral-500">M:{pad.midiNote}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
```

Replace it with:

```tsx
        {/* Interactive Kit Graphic */}
        <DrumKitStage onTriggerPad={handleTriggerPad} />
      </div>
```

(The closing `</div>` belongs to the outer panel container from line 403 — keep it as shown above so the panel still closes correctly.)

- [ ] **Step 3: Verify the app still builds**

Run: `npm run lint`
Expected: exits with no TypeScript errors.

- [ ] **Step 4: Manually verify in the browser**

Start the dev server (`preview_start` with the `neverlatestudio-dev` config, or `bun run dev`) and check:
1. The pad grid is gone; the interactive kit graphic renders in its place.
2. Clicking each visible zone (kick, snare center/rimshot/sidestick, hi-hat closed/semi/open/pedal, both toms, floor tom, both crashes, ride bow/bell, china, splash, and the 4 percussion buttons) plays the corresponding sound — cross-check by watching the "Active Trigger Monitor" telemetry strip already present above the kit (it shows `activeVoiceEvent.articulation`).
3. The clicked zone visibly flashes orange briefly.
4. Keyboard shortcuts (Q, W, E, R, A, S, D, F, T, Y, U, G, H, J, K, L, Z, X, C, V, B) still trigger the matching sound and flash.
5. The velocity-tier selector buttons above the kit still change how hard the next click hits (check the telemetry strip's reported velocity).

Expected: all of the above work exactly as described.

- [ ] **Step 5: Commit**

```bash
git add src/components/SampledDrumsStudio.tsx
git commit -m "feat: replace drum pad grid with interactive DrumKitStage"
```

---

### Task 7: Verify step-sequencer playback drives the kit graphic correctly

**Files:** none (verification-only task — no code changes)

This task exists because the spec explicitly calls out simultaneous-hit and BPM-sync verification as acceptance criteria; it's kept as its own task so it isn't silently skipped inside Task 6.

- [ ] **Step 1: Manually verify sequencer sync in the browser**

With the dev server running and the drums module open:
1. Set a groove using one of the existing preset buttons (Rock/Funk/Metal/Shuffle/Disco) — these are the existing `handleLoadGroove` presets, unchanged.
2. Press play on the step sequencer.
3. Watch the kit graphic while it plays at the preset's BPM. Confirm the kick, snare, and hi-hat zones flash in time with what you hear, including on steps where kick and closed hi-hat land on the same 16th note (e.g. step 0 of the Rock groove) — both zones should flash together on that step.
4. Change the BPM slider to a noticeably faster tempo (e.g. 180) while playing and confirm flashes keep staying in sync (no visible lag/drift accumulating over ~10 seconds).
5. Stop playback and confirm no zone is left "stuck" flashing.

Expected: all of the above hold. If a zone appears stuck flashing, check that the `.drum-zone-hit` animation's `forwards` fill mode is present (Task 2) — it should end at `opacity: 0`, not restart on its own.

- [ ] **Step 2: No commit needed**

This task makes no code changes; it only confirms Tasks 1-6 satisfy the sequencer-sync requirement from the spec's Testing/Verification section. If a bug is found, fix it as part of Task 6's files before proceeding, then re-run this verification.

---

### Task 8: Restyle `CustomDrumKitModal` to match the Neon/Glass look

**Files:**
- Modify: `src/components/CustomDrumKitModal.tsx:960-993` (articulation selector strip)
- Modify: `src/components/CustomDrumKitModal.tsx:798-806` (pad upload slot cards)

**Interfaces:**
- Consumes: `ZONE_CATEGORY_GLOW` from `../components/drumkit/drumKitZones` (Task 3) — note `CustomDrumKitModal.tsx` lives directly in `src/components/`, so the import path is `./drumkit/drumKitZones`.

This is a visual-only pass — no new fields, no new upload mechanics, per the spec's non-goals. It gives each articulation's pill/card an idle border tinted with the same category color used on the kit graphic, so switching between the kit view and the sample-upload view feels like the same product.

- [ ] **Step 1: Add the import**

In `src/components/CustomDrumKitModal.tsx`, add this import alongside the other local imports near the top of the file (after the `drumSampleProcessor` import):

```ts
import { ZONE_CATEGORY_GLOW } from './drumkit/drumKitZones';
```

- [ ] **Step 2: Tint the articulation selector strip**

Find this block (around lines 960-993):

```tsx
                {EXTENDED_PAD_DEFINITIONS.map((pad) => {
                  const isSel = selectedPadId === pad.id;
                  const layerCount = activeKit?.multiLayers?.[pad.id]
                    ? Object.keys(activeKit.multiLayers[pad.id]).length
                    : activeKit?.samples?.[pad.id]
                    ? 1
                    : 0;

                  return (
                    <button
                      key={pad.id}
                      onClick={() => setSelectedPadId(pad.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                        isSel
                          ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] shadow-md'
                          : 'bg-white/5 text-neutral-300 border-white/5 hover:bg-white/10'
                      }`}
                    >
```

Replace the button's `className`/style with a category-tinted idle border:

```tsx
                {EXTENDED_PAD_DEFINITIONS.map((pad) => {
                  const isSel = selectedPadId === pad.id;
                  const layerCount = activeKit?.multiLayers?.[pad.id]
                    ? Object.keys(activeKit.multiLayers[pad.id]).length
                    : activeKit?.samples?.[pad.id]
                    ? 1
                    : 0;
                  const glow = ZONE_CATEGORY_GLOW[pad.category];

                  return (
                    <button
                      key={pad.id}
                      onClick={() => setSelectedPadId(pad.id)}
                      style={isSel ? undefined : { borderColor: `${glow}55` }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                        isSel
                          ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] shadow-md'
                          : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
```

(The rest of the button's JSX body — icon, name, layer-count badge — is unchanged.)

- [ ] **Step 3: Tint the pad upload slot cards**

Find this block (around lines 798-806):

```tsx
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        isRecording
                          ? 'bg-[#FF453A]/15 border-[#FF453A] animate-pulse'
                          : isDragOver
                          ? 'bg-[#FF9F0A]/20 border-[#FF9F0A] scale-[1.01]'
                          : hasCustomSample
                          ? 'bg-black/40 border-[#30D158]/40 hover:border-[#30D158]'
                          : 'bg-black/30 border-white/10 hover:border-white/20'
                      }`}
```

Replace the final fallback (idle, no sample yet) with a category-tinted border. First, add `const glow = ZONE_CATEGORY_GLOW[padDef.category];` right above the `return (` in that `.map()` callback (the callback already destructures `padDef` — see line 774 in the surrounding code), then update the className:

```tsx
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        isRecording
                          ? 'bg-[#FF453A]/15 border-[#FF453A] animate-pulse'
                          : isDragOver
                          ? 'bg-[#FF9F0A]/20 border-[#FF9F0A] scale-[1.01]'
                          : hasCustomSample
                          ? 'bg-black/40 border-[#30D158]/40 hover:border-[#30D158]'
                          : 'bg-black/30 hover:border-white/20'
                      }`}
                      style={
                        !isRecording && !isDragOver && !hasCustomSample
                          ? { borderColor: `${glow}30` }
                          : undefined
                      }
```

- [ ] **Step 4: Verify the app still builds**

Run: `npm run lint`
Expected: exits with no TypeScript errors.

- [ ] **Step 5: Manually verify in the browser**

Open the drum module, click "My Library • Sady bicích" (wired to `onOpenCustomKitModal`, already present in the top bar), and confirm:
1. The modal still opens and functions exactly as before (kit switcher, tabs, upload, recording, export/import all still work — this task changed only idle border colors).
2. The articulation selector strip's unselected pills now show a faint color tint matching each category (kick=blue, snare=amber, hihat=emerald, toms=purple, cymbals=yellow, percussion=slate).
3. The multi-layer pad slot cards show the same idle tint when no sample is loaded yet.

Expected: all of the above hold.

- [ ] **Step 6: Commit**

```bash
git add src/components/CustomDrumKitModal.tsx
git commit -m "style: tint CustomDrumKitModal with shared drum category colors"
```

---

### Task 9: Verify the real-WAV-sample flow end to end

**Files:** none (verification-only task — no code changes)

This exercises spec Testing/Verification item 4 — confirming that a user-uploaded real sample actually overrides the synthetic sound through both the new kit graphic and the sequencer, now that Tasks 1-8 are done. No engine code changes are expected to be needed here (see the design spec's "Real sample integration" section — `SampledDrumEngine.getSampleBuffer` already prefers custom buffers over synthetic ones); if this step surfaces a bug, fix it in whichever file it traces back to before considering the plan complete.

- [ ] **Step 1: Upload a real sample and verify playback**

With the dev server running:
1. Open the drum module, open "My Library • Sady bicích".
2. Create a new custom kit (or select an existing one).
3. Go to the multi-layer tab, select the `kick` articulation, and upload or record one short WAV file for the `med` velocity tier, round-robin slot 1 (drag-and-drop onto the slot, or use the mic-record button already in the modal).
4. Close the modal, select that custom kit from the "Sada" dropdown in the drum module's top bar.
5. Click the kick zone on the `DrumKitStage` graphic.

Expected: you hear your uploaded WAV, not the synthetic kick — this confirms `SampledDrumEngine`'s existing custom-buffer-first resolution is wired all the way through the new UI.

6. Program a step-sequencer groove that includes kick hits (e.g. load the "Rock" preset) and press play.

Expected: the sequencer's kick hits also play your uploaded WAV, and the kick zone on the graphic flashes in time with it — same as Task 7's verification, now with a real sample.

- [ ] **Step 2: No commit needed**

This task makes no code changes. If everything in Step 1 works, the feature is complete: the interactive Neon/Glass kit graphic is live, and real user-uploaded samples override the synthetic engine exactly as designed.

---

## Self-Review Notes

- **Spec coverage:** Goal 1 (Neon/Glass SVG kit) → Tasks 3, 5. Goal 2 (zone-based click articulation) → Tasks 3, 5, 6. Goal 3 (visual flash on any trigger, click or sequencer) → Tasks 2, 4, 5, 7. Goal 4 (real WAV upload path, restyled) → Tasks 8, 9. Goal 5 (sequencer/mixer/humanize/kit-switcher untouched) → verified in Tasks 6 and 8's manual steps, no code in those files touched beyond the described spots.
- **Non-goals respected:** no `SampledDrumEngine.ts` edits anywhere in this plan; no bundled sample library; no click-velocity code; one shared `KIT_PIECE_GROUPS`/`KIT_VIEWBOX` used regardless of which kit is active (kit selection only changes what `activeKitId` is passed into the existing `triggerPad` call, which `DrumKitStage` doesn't need to know about since `handleTriggerPad` in `SampledDrumsStudio.tsx` already closes over `activeKitId`).
- **Type consistency check:** `DrumKitStage`'s prop is `{ onTriggerPad: (articulation: DrumArticulation) => void }` in both Task 5 (definition) and Task 6 (usage as `onTriggerPad={handleTriggerPad}`, and `handleTriggerPad`'s signature `(articulation: DrumArticulation, velocity?: number)` is call-compatible). `useDrumHitFlash()`'s return type `Partial<Record<DrumArticulation, number>>` matches how `DrumKitStage` indexes it (`flashKeys[zone.articulation]`, `flashKeys[pad.id]`) in Task 5. `ZONE_CATEGORY_GLOW` is typed `Record<PadCategory, string>` in Task 3 and indexed with `pad.category` (typed `PadCategory` in `PadTriggerDef`, Task 1) in Tasks 5 and 8 — consistent.
