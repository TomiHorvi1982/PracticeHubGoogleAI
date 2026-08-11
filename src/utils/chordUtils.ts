import { CHORDS_DATABASE } from '../data/chordsAndScales';
import { ChordDefinition, ChordVariation } from '../types';

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function transposeNoteName(note: string, semitones: number): string {
  if (semitones === 0) return note;
  let root = note;
  if (root === 'Db') root = 'C#';
  if (root === 'Eb') root = 'D#';
  if (root === 'Gb') root = 'F#';
  if (root === 'Ab') root = 'G#';
  if (root === 'Bb') root = 'A#';

  const index = CHROMATIC_SCALE.indexOf(root);
  if (index === -1) return note;

  let newIndex = (index + semitones) % 12;
  if (newIndex < 0) newIndex += 12;

  return CHROMATIC_SCALE[newIndex];
}

export function transposeChord(chordName: string, semitones: number): string {
  if (semitones === 0) return chordName;

  if (chordName.includes('/')) {
    const parts = chordName.split('/');
    return parts.map((p) => transposeChord(p, semitones)).join('/');
  }

  const match = chordName.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return chordName;

  const [, root, suffix] = match;
  const transposedRoot = transposeNoteName(root, semitones);
  return transposedRoot + suffix;
}

// Dynamically generate barre shapes for chords not in static database
export function findOrGenerateChord(chordName: string): ChordDefinition {
  // 1. Direct match in CHORDS_DATABASE
  const direct = CHORDS_DATABASE.find(
    (c) => c.name.toLowerCase() === chordName.toLowerCase()
  );
  if (direct) return direct;

  // 2. Handle slash chords (e.g. G/B, C/E)
  const baseName = chordName.split('/')[0].trim();
  const baseDirect = CHORDS_DATABASE.find(
    (c) => c.name.toLowerCase() === baseName.toLowerCase()
  );
  if (baseDirect) return { ...baseDirect, name: chordName };

  // 3. Match Root + Quality
  const match = baseName.match(/^([A-G][#b]?)(.*)$/);
  if (!match) {
    // Default fallback to C major
    return {
      name: chordName,
      root: 'C',
      type: 'Major',
      frets: [-1, 3, 2, 0, 1, 0],
      fingers: [0, 3, 2, 0, 1, 0],
      pianoKeys: [0, 4, 7],
    };
  }

  let root = match[1];
  const suffix = match[2].toLowerCase();

  if (root === 'Db') root = 'C#';
  if (root === 'Eb') root = 'D#';
  if (root === 'Gb') root = 'F#';
  if (root === 'Ab') root = 'G#';
  if (root === 'Bb') root = 'A#';

  const rootIdx = CHROMATIC_SCALE.indexOf(root);
  if (rootIdx === -1) {
    return {
      name: chordName,
      root: 'C',
      type: 'Major',
      frets: [-1, 3, 2, 0, 1, 0],
      fingers: [0, 3, 2, 0, 1, 0],
      pianoKeys: [0, 4, 7],
    };
  }

  const isMinor = suffix.includes('m') && !suffix.includes('maj');
  const is7 = suffix.includes('7') && !suffix.includes('maj7');
  const isMaj7 = suffix.includes('maj7');

  // E-string root positions (E=0, F=1, F#=2, G=3, G#=4, A=5, Bb=6, B=7, C=8, C#=9, D=10, D#=11)
  const fretOffsetE = rootIdx >= 4 ? rootIdx - 4 : rootIdx + 8; // E is index 4

  if (isMinor) {
    // Em barre shape
    return {
      name: chordName,
      root,
      type: 'Minor',
      frets: [fretOffsetE, fretOffsetE + 2, fretOffsetE + 2, fretOffsetE, fretOffsetE, fretOffsetE],
      fingers: [1, 3, 4, 1, 1, 1],
      barreFret: fretOffsetE,
      pianoKeys: [(rootIdx) % 12, (rootIdx + 3) % 12, (rootIdx + 7) % 12],
    };
  } else if (is7) {
    // E7 barre shape
    return {
      name: chordName,
      root,
      type: 'Dom 7',
      frets: [fretOffsetE, fretOffsetE + 2, fretOffsetE, fretOffsetE + 1, fretOffsetE, fretOffsetE],
      fingers: [1, 3, 1, 2, 1, 1],
      barreFret: fretOffsetE,
      pianoKeys: [(rootIdx) % 12, (rootIdx + 4) % 12, (rootIdx + 7) % 12, (rootIdx + 10) % 12],
    };
  } else if (isMaj7) {
    return {
      name: chordName,
      root,
      type: 'Maj 7',
      frets: [fretOffsetE, -1, fretOffsetE + 1, fretOffsetE + 1, fretOffsetE, -1],
      fingers: [1, 0, 3, 4, 2, 0],
      barreFret: fretOffsetE,
      pianoKeys: [(rootIdx) % 12, (rootIdx + 4) % 12, (rootIdx + 7) % 12, (rootIdx + 11) % 12],
    };
  } else {
    // E Major barre shape
    return {
      name: chordName,
      root,
      type: 'Major',
      frets: [fretOffsetE, fretOffsetE + 2, fretOffsetE + 2, fretOffsetE + 1, fretOffsetE, fretOffsetE],
      fingers: [1, 3, 4, 2, 1, 1],
      barreFret: fretOffsetE,
      pianoKeys: [(rootIdx) % 12, (rootIdx + 4) % 12, (rootIdx + 7) % 12],
    };
  }
}

// Extracts unique ordered chords from song content with transposition applied
export function extractUniqueChords(content: string, transposeSemitones: number = 0): string[] {
  if (!content) return [];
  const matches = content.match(/\[([^\]]+)\]/g) || [];
  const unique = new Set<string>();

  matches.forEach((m) => {
    const rawChord = m.slice(1, -1).trim();
    if (rawChord) {
      const transposed = transposeChord(rawChord, transposeSemitones);
      unique.add(transposed);
    }
  });

  return Array.from(unique);
}

// Generates 4 variations (Open, Barre E-shape, Barre A-shape, Powerchord) for guitarists
export function generateChordVariations(chordName: string): ChordVariation[] {
  const baseChord = findOrGenerateChord(chordName);
  const variations: ChordVariation[] = [];

  let root = baseChord.root || 'C';
  let rootIdx = CHROMATIC_SCALE.indexOf(root);
  if (rootIdx === -1) rootIdx = 0;

  const suffix = chordName.replace(/^[A-G][#b]?/, '').toLowerCase();
  const isMinor = suffix.includes('m') && !suffix.includes('maj');
  const is7 = suffix.includes('7') && !suffix.includes('maj7');
  const isMaj7 = suffix.includes('maj7');

  // 1. Primary / Open shape
  variations.push({
    id: 'var_open',
    label: 'Základní / Otevřený hmat',
    description: 'Tradiční akord v 1. poloze kytarového hmatníku.',
    category: 'open',
    chord: baseChord,
  });

  // 2. Barre E-shape (6th string root E-shape)
  const fretE = (rootIdx - 4 + 12) % 12 || 12;
  let fretsE: number[];
  let fingersE: number[];

  if (isMinor) {
    fretsE = [fretE, fretE + 2, fretE + 2, fretE, fretE, fretE];
    fingersE = [1, 3, 4, 1, 1, 1];
  } else if (is7) {
    fretsE = [fretE, fretE + 2, fretE, fretE + 1, fretE, fretE];
    fingersE = [1, 3, 1, 2, 1, 1];
  } else if (isMaj7) {
    fretsE = [fretE, -1, fretE + 1, fretE + 1, fretE, -1];
    fingersE = [1, 0, 3, 4, 2, 0];
  } else {
    fretsE = [fretE, fretE + 2, fretE + 2, fretE + 1, fretE, fretE];
    fingersE = [1, 3, 4, 2, 1, 1];
  }

  variations.push({
    id: 'var_barre_e',
    label: `Barre E-tvar (6. struna, ${fretE}. pražec)`,
    description: `Plný hutný akord s basovým tónem ${root} na nejnižší E struně.`,
    category: 'barre_e',
    chord: {
      ...baseChord,
      name: `${chordName} (Barre E-${fretE}fr)`,
      frets: fretsE,
      fingers: fingersE,
      barreFret: fretE,
    },
  });

  // 3. Barre A-shape (5th string root A-shape)
  const fretA = (rootIdx - 9 + 12) % 12 || 12;
  let fretsA: number[];
  let fingersA: number[];

  if (isMinor) {
    fretsA = [-1, fretA, fretA + 2, fretA + 2, fretA + 1, fretA];
    fingersA = [0, 1, 3, 4, 2, 1];
  } else if (is7) {
    fretsA = [-1, fretA, fretA + 2, fretA, fretA + 2, fretA];
    fingersA = [0, 1, 3, 1, 4, 1];
  } else if (isMaj7) {
    fretsA = [-1, fretA, fretA + 1, fretA + 1, fretA + 1, fretA];
    fingersA = [0, 1, 2, 3, 4, 1];
  } else {
    fretsA = [-1, fretA, fretA + 2, fretA + 2, fretA + 2, fretA];
    fingersA = [0, 1, 2, 3, 4, 1];
  }

  variations.push({
    id: 'var_barre_a',
    label: `Barre A-tvar (5. struna, ${fretA}. pražec)`,
    description: `Jasný kytarový hmat s basovým tónem ${root} na A struně.`,
    category: 'barre_a',
    chord: {
      ...baseChord,
      name: `${chordName} (Barre A-${fretA}fr)`,
      frets: fretsA,
      fingers: fingersA,
      barreFret: fretA,
    },
  });

  // 4. Powerchord
  const powerFrets = [-1, fretA, fretA + 2, fretA + 2, -1, -1];
  variations.push({
    id: 'var_power',
    label: `Powerchord / Rockový hmat (${root}5)`,
    description: `Dvoutónový/Třítónový úderný akord ideální pro rock a zkreslení.`,
    category: 'power',
    chord: {
      ...baseChord,
      name: `${root}5 Powerchord`,
      frets: powerFrets,
      fingers: [0, 1, 3, 4, 0, 0],
    },
  });

  return variations;
}
