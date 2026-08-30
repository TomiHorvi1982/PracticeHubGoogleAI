import { Chord, Scale, Note, Key } from 'tonal';
import type { UderHrace } from './vstupHrace';

/**
 * Zkoušení hraní, ne vědomostí.
 *
 * Kvíz se čtyřmi možnostmi ověří, že člověk ví, jak se akord jmenuje.
 * Nezjistí, jestli ho umí sáhnout. Tady se zadá tón, akord, stupnice
 * nebo podklad a hráč to musí zahrát — na kytaru do mikrofonu, na MIDI
 * klaviaturu nebo na počítačovou klávesnici.
 *
 * Dvě strany téhož: buď se úkol napíše a hráč ho zahraje, nebo se úkol
 * přehraje a hráč ho musí uhodnout po sluchu. Druhá strana je těžší a
 * učí to, co je při hraní s kapelou potřeba doopravdy.
 */

export type DruhUkolu = 'ton' | 'akord' | 'stupnice' | 'podklad';
/** Jak se úkol zadá: napsaný názvem, nebo přehraný. */
export type ZpusobZadani = 'napsane' | 'poslech';

export interface Ukol {
  druh: DruhUkolu;
  /** Lidský název, u poslechu se ukáže až po vyhodnocení. */
  nazev: string;
  /** Třídy tónů, které se čekají — u stupnice v pořadí odspodu. */
  cilove: string[];
  /** Konkrétní tóny i s oktávou pro přehrání ukázky. */
  ukazka: string[];
  zpusob: ZpusobZadani;
  /** U podkladu: kolik vteřin se improvizuje. */
  vterin?: number;
}

export interface Trefa {
  trida: string;
  ton: string;
  /** Patřil tón do úkolu? */
  spravne: boolean;
  /**
   * O kolik půltónů byl vedle nejbližšího chybějícího cílového tónu.
   * U trefy nula.
   */
  minulO: number;
  /** Odchylka od čisté výšky; jen z mikrofonu, jinde nula. */
  centy: number;
  cas: number;
}

export interface StavUkolu {
  /** Které cílové tóny už zazněly. */
  trefene: string[];
  trefy: Trefa[];
}

const TONY = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const AKORDY = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'dim', 'aug', '6', 'm6'];
const STUPNICE = [
  'major', 'minor', 'minor pentatonic', 'major pentatonic',
  'dorian', 'mixolydian', 'blues', 'harmonic minor',
];

const nahodne = <T,>(pole: T[]): T => pole[Math.floor(Math.random() * pole.length)];

/** Půltónová vzdálenost dvou tříd tónů po kruhu, 0 až 6. */
export function vzdalenost(a: string, b: string): number {
  const x = Note.chroma(a);
  const y = Note.chroma(b);
  if (x === undefined || y === undefined) return 6;
  const d = Math.abs(x - y) % 12;
  return Math.min(d, 12 - d);
}

/** Sedí dvě jména na tentýž tón? Db a C# jsou tentýž tón. */
export function stejnyTon(a: string, b: string): boolean {
  return Note.chroma(a) !== undefined && Note.chroma(a) === Note.chroma(b);
}

/** Rozloží třídy tónů do znějící polohy kolem dané oktávy. */
export function doOktavy(tridy: string[], oktava = 4): string[] {
  let minulá = -1;
  return tridy.map((t) => {
    const chroma = Note.chroma(t) ?? 0;
    // Stoupá se: jakmile by tón byl níž než předchozí, jde o oktávu výš.
    if (chroma <= minulá) oktava++;
    minulá = chroma;
    return `${t}${oktava}`;
  });
}

export function vytvorUkol(druh: DruhUkolu, zpusob: ZpusobZadani): Ukol {
  if (druh === 'ton') {
    const ton = nahodne(TONY);
    return { druh, zpusob, nazev: ton, cilove: [ton], ukazka: [`${ton}4`] };
  }

  if (druh === 'akord') {
    // Losuje se, dokud tvar nedá tóny. Cyklus, ne rekurze: kdyby knihovna
    // neznala žádný z tvarů, rekurze by shodila prohlížeč přetečením
    // zásobníku místo toho, aby prostě vrátila durový akord.
    for (let pokus = 0; pokus < 12; pokus++) {
      const ton = nahodne(TONY);
      const nazev = `${ton}${nahodne(AKORDY)}`;
      const tony = Chord.get(nazev).notes;
      if (tony.length >= 3) return { druh, zpusob, nazev, cilove: tony, ukazka: doOktavy(tony, 3) };
    }
    const tony = Chord.get('C').notes;
    return { druh, zpusob, nazev: 'C', cilove: tony, ukazka: doOktavy(tony, 3) };
  }

  if (druh === 'stupnice') {
    for (let pokus = 0; pokus < 12; pokus++) {
      const ton = nahodne(TONY);
      const typ = nahodne(STUPNICE);
      const tony = Scale.get(`${ton} ${typ}`).notes;
      if (tony.length >= 5) {
        return {
          druh, zpusob,
          nazev: `${ton} ${typ}`,
          cilove: tony,
          ukazka: [...doOktavy(tony, 3), `${ton}4`],
        };
      }
    }
    const tony = Scale.get('C major').notes;
    return { druh, zpusob, nazev: 'C major', cilove: tony, ukazka: [...doOktavy(tony, 3), 'C4'] };
  }

  // Podklad: hraje se sled akordů v tónině a hráč do něj improvizuje.
  const ton = nahodne(TONY);
  const dur = Math.random() > 0.5;
  const stupnice = Scale.get(`${ton} ${dur ? 'major' : 'minor'}`).notes;
  const akordy = (dur ? Key.majorKey(ton).chords : Key.minorKey(ton).natural.chords)
    .map((a) => String(a).replace(/^([A-G][#b]?)M(?![a-z0-9])/, '$1'));
  return {
    druh: 'podklad',
    zpusob: 'napsane',
    nazev: `${ton} ${dur ? 'dur' : 'moll'}`,
    cilove: stupnice,
    // Kadence, ne náhodné akordy — v ní je tónina slyšet.
    ukazka: [akordy[0], akordy[5], akordy[3], akordy[4]].filter(Boolean),
    vterin: 30,
  };
}

/**
 * Zařadí jeden úder do rozehraného úkolu.
 *
 * U podkladu se za správný počítá každý tón ze stupnice a nic se
 * neodškrtává — improvizace nemá konec, jen počet tónů mimo tóninu.
 */
export function vyhodnotUder(ukol: Ukol, stav: StavUkolu, uder: UderHrace): StavUkolu {
  const patri = ukol.cilove.some((c) => stejnyTon(c, uder.trida));

  if (ukol.druh === 'podklad') {
    const trefa: Trefa = {
      trida: uder.trida, ton: uder.ton, spravne: patri,
      minulO: patri ? 0 : Math.min(...ukol.cilove.map((c) => vzdalenost(c, uder.trida))),
      centy: uder.centy, cas: uder.cas,
    };
    return { trefene: stav.trefene, trefy: [...stav.trefy, trefa] };
  }

  const uzByl = stav.trefene.some((t) => stejnyTon(t, uder.trida));
  const chybi = ukol.cilove.filter((c) => !stav.trefene.some((t) => stejnyTon(t, c)));

  const trefa: Trefa = {
    trida: uder.trida,
    ton: uder.ton,
    spravne: patri && !uzByl,
    // Měří se k tomu, co ještě chybí: zahrát potřetí týž tón není
    // „vedle o nulu", ale ani chyba o půltón.
    minulO: patri ? 0 : chybi.length
      ? Math.min(...chybi.map((c) => vzdalenost(c, uder.trida)))
      : 0,
    centy: uder.centy,
    cas: uder.cas,
  };

  return {
    trefene: patri && !uzByl ? [...stav.trefene, uder.trida] : stav.trefene,
    trefy: [...stav.trefy, trefa],
  };
}

export function jeHotovo(ukol: Ukol, stav: StavUkolu): boolean {
  if (ukol.druh === 'podklad') return false;
  return ukol.cilove.every((c) => stav.trefene.some((t) => stejnyTon(t, c)));
}

/** Kolik úderů bylo mimo zadání. */
export function pocetChyb(stav: StavUkolu): number {
  return stav.trefy.filter((t) => !t.spravne && t.minulO > 0).length;
}

/** Průměrná odchylka intonace z mikrofonu, nebo null, když se nehrálo živě. */
export function prumerCentu(stav: StavUkolu): number | null {
  const z = stav.trefy.filter((t) => t.spravne && t.centy !== 0);
  if (!z.length) return null;
  return Math.round(z.reduce((a, t) => a + Math.abs(t.centy), 0) / z.length);
}
