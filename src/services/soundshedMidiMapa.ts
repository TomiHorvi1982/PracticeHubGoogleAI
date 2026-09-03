import { DruhZpravy, popisZpravy } from './midiZpravy';

/**
 * Co všechno jde v Soundshedu ovládat přes MIDI.
 *
 * Seznam není vymyšlený — odpovídá adresám automatizačních slotů, které
 * Soundshed 1.4.1 zná (`default.setlistPreset1`…`8`, `default.bankUp`,
 * `gate.threshold`, `doubler.mix` a spol.). Jinak řečeno: každá položka
 * tady má v Soundshedu protějšek, který se dá naučit přes MIDI Learn.
 *
 * Čísla CC jsou naše, ne jeho. Soundshed si při učení zapamatuje, co mu
 * přijde, takže stačí, aby byla čísla mezi sebou různá a nekolidovala
 * s běžnými zprávami z jiných zařízení. Proto se začíná na 20 —
 * pod tím sedí modulace, hlasitost, expression a další obsazená.
 */

export type DruhOvladace = 'stisk' | 'plynuly' | 'prepinac';

export interface Ovladac {
  id: string;
  nazev: string;
  /** Adresa slotu v Soundshedu — podle ní se pozná, co učit. */
  adresa: string;
  druh: DruhOvladace;
  skupina: 'Presety' | 'Úrovně' | 'Brána' | 'Efekty' | 'Metronom';
  /** Výchozí číslo CC nebo noty. */
  cislo: number;
  /** Nápověda tam, kde by adresa sama nestačila. */
  poznamka?: string;
}

/** Osm padů setlistu — tak, jak je Soundshed čísluje. */
const PADY: Ovladac[] = Array.from({ length: 8 }, (_, i) => ({
  id: `preset${i + 1}`,
  nazev: `Preset ${i + 1}`,
  adresa: `default.setlistPreset${i + 1}`,
  druh: 'stisk' as const,
  skupina: 'Presety' as const,
  cislo: 20 + i,
}));

export const OVLADACE: Ovladac[] = [
  ...PADY,
  {
    id: 'bankDown', nazev: 'Banka −', adresa: 'default.bankDown',
    druh: 'stisk', skupina: 'Presety', cislo: 28,
    poznamka: 'Setlisty jsou v bankách po osmi. Tímhle se přepíná mezi nimi.',
  },
  {
    id: 'bankUp', nazev: 'Banka +', adresa: 'default.bankUp',
    druh: 'stisk', skupina: 'Presety', cislo: 29,
  },
  {
    id: 'inputLevel', nazev: 'Vstupní úroveň', adresa: 'default.inputLevel',
    druh: 'plynuly', skupina: 'Úrovně', cislo: 30,
  },
  {
    id: 'outputLevel', nazev: 'Výstupní úroveň', adresa: 'default.outputLevel',
    druh: 'plynuly', skupina: 'Úrovně', cislo: 31,
  },
  {
    id: 'gateThreshold', nazev: 'Práh brány', adresa: 'gate.threshold',
    druh: 'plynuly', skupina: 'Brána', cislo: 32,
    poznamka: 'Čím výš, tím dřív brána zavře šum mezi tóny.',
  },
  {
    id: 'gateRelease', nazev: 'Doběh brány', adresa: 'gate.release',
    druh: 'plynuly', skupina: 'Brána', cislo: 33,
  },
  {
    id: 'doublerEnabled', nazev: 'Doubler', adresa: 'doubler.enabled',
    druh: 'prepinac', skupina: 'Efekty', cislo: 34,
  },
  {
    id: 'doublerMix', nazev: 'Doubler — mix', adresa: 'doubler.mix',
    druh: 'plynuly', skupina: 'Efekty', cislo: 35,
  },
  {
    id: 'transposeEnabled', nazev: 'Transpozice', adresa: 'transpose.enabled',
    druh: 'prepinac', skupina: 'Efekty', cislo: 36,
  },
  {
    id: 'transposeSemitones', nazev: 'Transpozice — půltóny', adresa: 'transpose.semitones',
    druh: 'plynuly', skupina: 'Efekty', cislo: 37,
    poznamka: 'Střed posuvníku je bez posunu.',
  },
  {
    id: 'limiterEnabled', nazev: 'Limiter', adresa: 'limiter.enabled',
    druh: 'prepinac', skupina: 'Efekty', cislo: 38,
  },
  {
    id: 'metronomeEnabled', nazev: 'Metronom', adresa: 'metronome.enabled',
    druh: 'prepinac', skupina: 'Metronom', cislo: 39,
  },
  {
    id: 'metronomeVolume', nazev: 'Metronom — hlasitost', adresa: 'metronome.volumeDb',
    druh: 'plynuly', skupina: 'Metronom', cislo: 40,
  },
];

/** Pořadí skupin v panelu — presety nahoru, jsou nejpoužívanější. */
export const SKUPINY: Ovladac['skupina'][] = ['Presety', 'Úrovně', 'Brána', 'Efekty', 'Metronom'];

export interface NastaveniMidi {
  druh: DruhZpravy;
  kanal: number;
  /** Přepsaná čísla; co tu není, má výchozí z katalogu. */
  cisla: Record<string, number>;
}

export const VYCHOZI_NASTAVENI: NastaveniMidi = { druh: 'cc', kanal: 1, cisla: {} };

export function cisloOvladace(o: Ovladac, n: NastaveniMidi): number {
  const vlastni = n.cisla[o.id];
  return Number.isFinite(vlastni) ? vlastni : o.cislo;
}

export function popisOvladace(o: Ovladac, n: NastaveniMidi): string {
  return popisZpravy(n.druh, n.kanal, cisloOvladace(o, n));
}

/**
 * Hlídá, aby dva ovladače nemířily na totéž číslo.
 *
 * Kdyby ano, naučil by se Soundshed dvě věci na jednu zprávu a jedna
 * z nich by přestala fungovat — a přijít na to je pak otrava.
 */
export function kolizeCisel(n: NastaveniMidi): string[] {
  const podleCisla = new Map<number, string[]>();
  for (const o of OVLADACE) {
    const c = cisloOvladace(o, n);
    if (!podleCisla.has(c)) podleCisla.set(c, []);
    podleCisla.get(c)!.push(o.nazev);
  }
  return [...podleCisla.entries()]
    .filter(([, kdo]) => kdo.length > 1)
    .map(([c, kdo]) => `${kdo.join(' a ')} míří na totéž (${c})`);
}
