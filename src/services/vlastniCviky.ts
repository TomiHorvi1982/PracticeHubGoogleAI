import { Tonu } from './cvikyTechnik';

/**
 * Vlastní cvičení.
 *
 * Hotové stupnice a technické vzory pokryjí, co se cvičí obecně. Co se
 * ale zrovna nedaří v konkrétní písni — ten jeden přechod, to jedno
 * místo se skokem přes tři pražce — v žádném seznamu není. Tohle je
 * místo, kam si to naťukáš na hmatníku a uložíš.
 *
 * Ukládá se v prohlížeči. Do databáze to patří ve chvíli, kdy si budeš
 * chtít cvik otevřít i na jiném počítači nebo ho poslat kapele; tvar dat
 * je na to připravený.
 */

export interface VlastniCvik {
  id: string;
  nazev: string;
  tony: Tonu[];
  /** V jakém tempu jsi ho naposled cvičil. */
  bpm: number;
  /** Kterou kytarou. Zvuk je součást cviku — chug zní jinak než arpeggio. */
  zvuk?: string;
  ulozeno: number;
}

const KLIC = 'neverlate_vlastni_cviky';

/**
 * Pořadové číslo pro identitu cviku.
 *
 * Samotný čas nestačí: dva cviky uložené ve stejné milisekundě dostaly
 * totéž id a smazání jednoho vzalo oba. Čas drží řazení, počitadlo
 * rozlišuje.
 */
let pocitadlo = 0;

/** Je to tón, který se dá zahrát? Uložená data mohou být z jiné verze. */
function jeTon(x: any): x is Tonu {
  return !!x
    && Number.isInteger(x.struna) && x.struna >= 0 && x.struna < 6
    && Number.isInteger(x.prazec) && x.prazec >= 0 && x.prazec <= 30;
}

function jeCvik(x: any): x is VlastniCvik {
  return !!x
    && typeof x.id === 'string'
    && typeof x.nazev === 'string'
    && Array.isArray(x.tony)
    && x.tony.every(jeTon);
}

export function prectiCviky(): VlastniCvik[] {
  try {
    const d = JSON.parse(localStorage.getItem(KLIC) || '[]');
    return Array.isArray(d) ? d.filter(jeCvik) : [];
  } catch {
    return [];
  }
}

export function ulozCviky(c: VlastniCvik[]): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(c));
  } catch {
    /* plné úložiště nesmí shodit cvičení — jen ho nepřežije */
  }
}

/**
 * Uloží cvik, nebo přepíše ten stejnojmenný.
 *
 * Přepis podle jména je schválně: druhá „Přechod do refrénu" by byla
 * k ničemu — člověk cvik doladí a uloží znovu, ne aby si zakládal
 * očíslované varianty.
 */
export function ulozCvik(
  cviky: VlastniCvik[],
  nazev: string,
  tony: Tonu[],
  bpm: number,
  zvuk?: string,
): VlastniCvik[] {
  const jmeno = nazev.trim() || navrhniNazev(cviky);
  const i = cviky.findIndex((c) => c.nazev.toLowerCase() === jmeno.toLowerCase());
  const telo = { nazev: jmeno, tony: [...tony], bpm, zvuk, ulozeno: Date.now() };
  if (i < 0) return [...cviky, { id: `c-${Date.now().toString(36)}-${++pocitadlo}`, ...telo }];
  const kopie = [...cviky];
  kopie[i] = { ...kopie[i], ...telo };
  return kopie;
}

export function smazCvik(cviky: VlastniCvik[], id: string): VlastniCvik[] {
  return cviky.filter((c) => c.id !== id);
}

/** Jméno pro cvik, který si ho nezadal. Číslo se nesmí opakovat. */
export function navrhniNazev(cviky: VlastniCvik[]): string {
  const pouzita = new Set(cviky.map((c) => c.nazev.toLowerCase()));
  for (let i = 1; i < 500; i++) {
    const n = `Cvik ${i}`;
    if (!pouzita.has(n.toLowerCase())) return n;
  }
  return `Cvik ${Date.now()}`;
}

/**
 * Přidá tón na konec.
 *
 * Nehlídá se, jestli se tón opakuje: opakovaný tón je pořád tón a
 * cvičení na střídavý úder na jednom pražci je běžná věc.
 */
export function pridejTon(tony: Tonu[], t: Tonu): Tonu[] {
  return [...tony, t];
}

/** Ubere poslední tón. Překlep se opravuje odzadu, ne mazáním všeho. */
export function uberPosledni(tony: Tonu[]): Tonu[] {
  return tony.slice(0, -1);
}
