/**
 * Rozložení počítačové klávesnice jako klaviatury.
 *
 * Dvě oktávy plus zakončovací C, spodní řada bílé klávesy a horní černé —
 * stejné rozvržení, jaké mají všechny softwarové nástroje, takže si ho
 * člověk nemusí učit znovu.
 *
 * Sdílené, protože stejné zkratky potřebují Virtual Instruments i cvičení
 * v Testing Room. Dvě kopie by se rozešly a hráč by v jedné sekci mačkal
 * jiný tón než ve druhé.
 */
export interface KlavesaPC {
  root: string;
  relOctave: number;
  keyShortcut: string;
  isBlack: boolean;
}

export const BASE_PIANO_LAYOUT: KlavesaPC[] = [
  // První oktáva (0..11)
  { root: 'C', relOctave: 0, keyShortcut: 'a', isBlack: false },
  { root: 'C#', relOctave: 0, keyShortcut: 'w', isBlack: true },
  { root: 'D', relOctave: 0, keyShortcut: 's', isBlack: false },
  { root: 'D#', relOctave: 0, keyShortcut: 'e', isBlack: true },
  { root: 'E', relOctave: 0, keyShortcut: 'd', isBlack: false },
  { root: 'F', relOctave: 0, keyShortcut: 'f', isBlack: false },
  { root: 'F#', relOctave: 0, keyShortcut: 't', isBlack: true },
  { root: 'G', relOctave: 0, keyShortcut: 'g', isBlack: false },
  { root: 'G#', relOctave: 0, keyShortcut: 'y', isBlack: true },
  { root: 'A', relOctave: 0, keyShortcut: 'h', isBlack: false },
  { root: 'A#', relOctave: 0, keyShortcut: 'u', isBlack: true },
  { root: 'B', relOctave: 0, keyShortcut: 'j', isBlack: false },
  // Druhá oktáva (12..23)
  { root: 'C', relOctave: 1, keyShortcut: 'k', isBlack: false },
  { root: 'C#', relOctave: 1, keyShortcut: 'o', isBlack: true },
  { root: 'D', relOctave: 1, keyShortcut: 'l', isBlack: false },
  { root: 'D#', relOctave: 1, keyShortcut: 'p', isBlack: true },
  { root: 'E', relOctave: 1, keyShortcut: 'z', isBlack: false },
  { root: 'F', relOctave: 1, keyShortcut: 'x', isBlack: false },
  { root: 'F#', relOctave: 1, keyShortcut: '1', isBlack: true },
  { root: 'G', relOctave: 1, keyShortcut: 'c', isBlack: false },
  { root: 'G#', relOctave: 1, keyShortcut: '2', isBlack: true },
  { root: 'A', relOctave: 1, keyShortcut: 'v', isBlack: false },
  { root: 'A#', relOctave: 1, keyShortcut: '3', isBlack: true },
  { root: 'B', relOctave: 1, keyShortcut: 'b', isBlack: false },
  // Zakončovací C
  { root: 'C', relOctave: 2, keyShortcut: 'n', isBlack: false },
];
