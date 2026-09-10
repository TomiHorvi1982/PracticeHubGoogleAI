import { STANDARDNI_LADENI, jmenaStrun } from './cvikyTechnik';

/**
 * Ladění virtuální kytary.
 *
 * Hmatník je fyzická věc: pátý pražec na nejnižší struně je pořád pátý
 * pražec, ať je kytara naladěná jakkoli. Co se mění, je tón, který z něj
 * vyjde — a s ním všechno ostatní: kde na krku leží stupnice, jak se
 * jmenují struny v tabulatuře a co se má rozeznít při přehrávání.
 *
 * Proto se ladění drží na jednom místě a všechny výpočty ho berou jako
 * parametr. Kdyby si každá část držela svoje, stačilo by na jednu
 * zapomenout a stupnice by ukazovala jinam, než co je slyšet.
 *
 * Ladění je nastavení kytary, ne vlastnost cviku. Uložený cvik si pamatuje
 * pražce; přeladíš-li kytaru, zahraje se stejným hmatem jinak — přesně
 * jako doopravdy.
 *
 * Bez Reactu a bez databáze, aby to šlo ověřit testem.
 */

export interface LadeniPreset {
  id: string;
  nazev: string;
  /** MIDI čísla od nejnižší struny. */
  struny: number[];
  popis: string;
}

/**
 * Meze, do kterých se dá ladit.
 *
 * Zdola H0 (MIDI 23) — níž už struna na kytaře nedrží napětí a zvuk je
 * jen mlasknutí. Shora E5 (76), o oktávu nad standardní nejvyšší strunou;
 * výš se ladí leda ukulele.
 */
export const NEJNIZSI = 23;
export const NEJVYSSI = 76;

/**
 * Hotová ladění.
 *
 * Vybraná podle toho, co se doopravdy hraje: drop ladění na riffy,
 * snížená na metal a na zpěváky, otevřená na slide a folk. Všechna jsou
 * odvozená ze standardního posunem, takže se dají spočítat a ověřit —
 * `dropD` je standard s nejnižší strunou o dva půltóny níž, `dropC` je
 * `dropD` celý o dva níž.
 */
export const LADENI: LadeniPreset[] = [
  { id: 'standard', nazev: 'Standardní E', struny: [40, 45, 50, 55, 59, 64], popis: 'E A D G H e — jak kytara přijde z krámu.' },
  { id: 'dropD', nazev: 'Drop D', struny: [38, 45, 50, 55, 59, 64], popis: 'Nejnižší struna o celý tón dolů. Kvinta jedním prstem.' },
  { id: 'eb', nazev: 'Půltón dolů (Eb)', struny: [39, 44, 49, 54, 58, 63], popis: 'Celá kytara o půltón níž. Hendrix, Guns N’ Roses.' },
  { id: 'dStandard', nazev: 'D standard', struny: [38, 43, 48, 53, 57, 62], popis: 'Celý tón dolů. Tlustší zvuk, měkčí struny.' },
  { id: 'dropCis', nazev: 'Drop C#', struny: [37, 44, 49, 54, 58, 63], popis: 'Drop D o půltón níž.' },
  { id: 'dropC', nazev: 'Drop C', struny: [36, 43, 48, 53, 57, 62], popis: 'Drop D o celý tón níž. Moderní metal.' },
  { id: 'dropB', nazev: 'Drop B', struny: [35, 42, 47, 52, 56, 61], popis: 'Ještě níž. Chce silnější struny, jinak plandají.' },
  { id: 'dadgad', nazev: 'DADGAD', struny: [38, 45, 50, 55, 57, 62], popis: 'Keltské a akustické. Zní jako akord i naprázdno.' },
  { id: 'openG', nazev: 'Otevřené G', struny: [38, 43, 50, 55, 59, 62], popis: 'Prázdné struny dají G dur. Slide, Stones.' },
  { id: 'openD', nazev: 'Otevřené D', struny: [38, 45, 50, 54, 57, 62], popis: 'Prázdné struny dají D dur. Blues a slide.' },
  { id: 'openE', nazev: 'Otevřené E', struny: [40, 47, 52, 56, 59, 64], popis: 'Otevřené D naladěné o tón výš. Pozor na napětí.' },
];

export const KLIC_LADENI = 'neverlate_ladeni_kytary';

/** Je to použitelné ladění? Uložená data mohou být z jiné verze. */
export function platneLadeni(x: any): x is number[] {
  return Array.isArray(x)
    && x.length === 6
    && x.every((m) => Number.isInteger(m) && m >= NEJNIZSI && m <= NEJVYSSI);
}

/** Ořízne tón do mezí, ve kterých struna ještě drží. */
export function omezStrunu(midi: number): number {
  return Math.min(NEJVYSSI, Math.max(NEJNIZSI, Math.round(midi)));
}

/**
 * Přeladí jednu strunu.
 *
 * Struny se navzájem nehlídají — křížení výšek je legitimní ladění
 * (v otevřeném G je nejnižší struna D, tedy výš než E pod ní ve
 * standardu) a bránit mu by znemožnilo půlku seznamu výš.
 */
export function posunStrunu(struny: number[], index: number, oPultony: number): number[] {
  if (index < 0 || index >= struny.length) return struny;
  return struny.map((m, i) => (i === index ? omezStrunu(m + oPultony) : m));
}

/**
 * Přeladí celou kytaru.
 *
 * Když by některá struna vyjela z mezí, neposune se nic — jinak by se
 * ladění po několika kliknutích tiše zdeformovalo, protože krajní struna
 * by se zastavila a ostatní jely dál.
 */
export function posunLadeni(struny: number[], oPultony: number): number[] {
  const nove = struny.map((m) => m + oPultony);
  if (nove.some((m) => m < NEJNIZSI || m > NEJVYSSI)) return struny;
  return nove;
}

/** Hotové ladění, které přesně sedí — nebo `null`, když je vlastní. */
export function najdiPreset(struny: number[]): LadeniPreset | null {
  return LADENI.find((l) => l.struny.every((m, i) => m === struny[i])) || null;
}

/** Jak se ladění jmenuje: názvem hotového, jinak výčtem strun. */
export function popisLadeni(struny: number[]): string {
  const p = najdiPreset(struny);
  return p ? p.nazev : jmenaStrun(struny).join(' ');
}

/** O kolik půltónů je struna jinak než ve standardu. */
export function odchylkaOdStandardu(struny: number[], index: number): number {
  return (struny[index] ?? 0) - (STANDARDNI_LADENI[index] ?? 0);
}

/** Je kytara naladěná standardně? */
export function jeStandardni(struny: number[]): boolean {
  return STANDARDNI_LADENI.every((m, i) => m === struny[i]);
}

/**
 * Načte uložené ladění.
 *
 * Uložené nesmyslné hodnoty se ignorují místo pádu — s rozbitým laděním
 * by nešel otevřít celý hmatník.
 */
export function nactiLadeni(): number[] {
  if (typeof localStorage === 'undefined') return [...STANDARDNI_LADENI];
  try {
    const d = JSON.parse(localStorage.getItem(KLIC_LADENI) || 'null');
    return platneLadeni(d) ? d : [...STANDARDNI_LADENI];
  } catch {
    return [...STANDARDNI_LADENI];
  }
}

export function ulozLadeni(struny: number[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (platneLadeni(struny)) localStorage.setItem(KLIC_LADENI, JSON.stringify(struny));
  } catch {
    /* Plné úložiště nemá shodit cvičení. */
  }
}
