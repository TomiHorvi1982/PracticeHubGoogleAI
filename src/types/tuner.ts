// Detekce výšky tónu převzatá z projektu MoChord.
//
//   https://github.com/Mocha-Yuan/MoChord
//   MIT License, Copyright (c) 2026 MoChord contributors
//   Plné znění licence: licenses/MoChord-LICENSE.txt
//
// Důvod výměny: původní ladička používala autokorelaci, která u hlubokých
// strun ráda ukáže tón o oktávu výš. Tenhle engine používá YIN
// s mediánovým filtrem, což je na kytaru výrazně spolehlivější.
//
// Změny oproti originálu: odstraněna závislost na jejich `storageMigration`
// (jediné použití nahrazeno rovnocennou funkcí níže), aby engine nevlekl
// zbytek jejich projektu.

export type TunerStatus = "idle" | "listening" | "no-signal" | "in-tune" | "off-pitch" | "locked" | "error";

export type BuiltInTuningPresetId = "standard" | "drop-d" | "low-c" | "dadgad" | "half-step-down" | "custom";

export type TuningPresetId = BuiltInTuningPresetId | `stored:${string}`;

export type TuningTarget = {
  id: string;
  label: string;
  note: string;
  octave: number;
  midi: number;
  frequency: number;
  stringNumber: number;
  fret?: number;
};

export type TuningPreset = {
  id: TuningPresetId;
  label: string;
  pitches: string[];
};

export type StoredTuningPreset = {
  id: `stored:${string}`;
  name: string;
  pitches: string[];
};

export type DetectedPitch = {
  frequency: number;
  note: string;
  octave: number;
  midi: number;
  targetFrequency: number;
  cents: number;
  clarity: number;
  inputLevel: number;
};

export type TunerFrame = {
  pitch: DetectedPitch | null;
  inputLevel: number;
};
