import { MidiTrack } from './midiPlayerService';

/**
 * Tónina a hlavní nástroj skladby.
 *
 * Tónina se nepozná z toho, které tóny se v souboru objeví — v pár taktech
 * chromatiky se objeví všechny. Pozná se z toho, jak dlouho který tón zní:
 * v C dur se drží C, G a E, kdežto C# jen problikne. Porovnává se to
 * s profily, které naměřili Krumhansl a Kessler na posluchačích — pro
 * každou ze čtyřiadvaceti tónin se spočítá, jak dobře sedí, a vybere se
 * nejlepší.
 *
 * Prosté `Scale.detect` z knihovny by chtělo přesnou sadu tónů, takže na
 * skutečnou skladbu nestačí.
 */

/** Jak výrazný má být který stupeň v durové tónině. */
const DUR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
/** Totéž pro moll. */
const MOLL = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const TONY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface Tonina {
  /** Základní tón, třeba „G". */
  ton: string;
  /** `true` pro dur. */
  dur: boolean;
  /** Jak dobře to sedí, 0 až 1 — pod 0,6 je to spíš dohad. */
  jistota: number;
  /** Název pro člověka, třeba „G dur". */
  nazev: string;
}

/** Pearsonův korelační koeficient — jak si dvě řady odpovídají tvarem. */
function korelace(a: number[], b: number[]): number {
  const n = a.length;
  const pa = a.reduce((s, x) => s + x, 0) / n;
  const pb = b.reduce((s, x) => s + x, 0) / n;
  let citatel = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - pa;
    const y = b[i] - pb;
    citatel += x * y;
    da += x * x;
    db += y * y;
  }
  const jmenovatel = Math.sqrt(da * db);
  return jmenovatel === 0 ? 0 : citatel / jmenovatel;
}

export function urciToninu(tracks: MidiTrack[]): Tonina | null {
  const vahy = new Array(12).fill(0);
  let celkem = 0;

  for (const t of tracks) {
    // Bicí nemají tóninu — jejich noty jsou čísla nástrojů, ne výšky.
    if (t.isDrum) continue;
    for (const n of t.notes) {
      // Váhou je délka: tón, který se drží, o tónině vypovídá víc než
      // šestnáctina v přeběhu.
      const vaha = Math.min(n.duration, 2) * (0.4 + n.velocity * 0.6);
      vahy[((n.midi % 12) + 12) % 12] += vaha;
      celkem += vaha;
    }
  }

  if (celkem < 1) return null;

  let nej: Tonina | null = null;
  let druhy = -Infinity;

  for (let posun = 0; posun < 12; posun++) {
    for (const dur of [true, false]) {
      const profil = (dur ? DUR : MOLL).map((_, i) => (dur ? DUR : MOLL)[(i - posun + 12) % 12]);
      const skore = korelace(vahy, profil);
      if (!nej || skore > nej.jistota) {
        if (nej) druhy = Math.max(druhy, nej.jistota);
        nej = {
          ton: TONY[posun],
          dur,
          jistota: skore,
          nazev: `${TONY[posun]} ${dur ? 'dur' : 'moll'}`,
        };
      } else if (skore > druhy) {
        druhy = skore;
      }
    }
  }

  if (!nej) return null;
  // Jistota se udává jako náskok před druhou nejlepší tóninou, ne jako
  // holá korelace: ta vychází vysoká i tam, kde jsou dvě tóniny stejně
  // dobré (dur a její paralelní moll mají tytéž tóny).
  const naskok = Math.max(0, nej.jistota - druhy);
  return { ...nej, jistota: Math.min(1, Math.max(0, nej.jistota * 0.5 + naskok * 1.5)) };
}

export interface HlavniNastroj {
  program: number;
  nazev: string;
  /** Kolik not na něj připadá — kvůli poznámce v UI. */
  not: number;
}

/**
 * Nástroj, který ve skladbě převažuje.
 *
 * Rozhoduje počet not, ne pořadí stop: první stopa bývá melodie, ale
 * u orchestrálních souborů to je klidně triangl.
 */
export function urciHlavniNastroj(tracks: MidiTrack[]): HlavniNastroj | null {
  const podleNazvu = new Map<string, { not: number; program: number }>();
  for (const t of tracks) {
    if (t.isDrum) continue;
    const zaznam = podleNazvu.get(t.programName) || { not: 0, program: t.program };
    zaznam.not += t.notes.length;
    podleNazvu.set(t.programName, zaznam);
  }
  if (podleNazvu.size === 0) return null;

  const [nazev, data] = [...podleNazvu.entries()].sort((a, b) => b[1].not - a[1].not)[0];
  return { program: data.program, nazev, not: data.not };
}
