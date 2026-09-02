/**
 * Předání vybraného úseku z tabulatury do cvičení sóla.
 *
 * V Guitar Pru si vybereš takty, tady se to odloží a v Solo Room se to
 * vyzvedne. Přes localStorage schválně: mezi sekcemi se přechází
 * překreslením stránky a stav v paměti by se cestou ztratil — a hlavně
 * si tak úsek počká i přes zavření prohlížeče, což je přesně to, co
 * cvičení potřebuje.
 */

import { TIKU_NA_CTVRTKU } from './gpUsek';

const KLIC = 'neverlate_usek_cviceni';

export interface UsekKeCviceni {
  /** Kde leží soubor s tabulaturou. */
  prilohaId: string;
  prilohaNazev: string;
  storageBucket?: string;
  storagePath?: string;
  /** Úsek v taktech, číslováno od nuly, oba konce včetně. */
  odTaktu: number;
  doTaktu: number;
  /** Týž úsek v tikách — to, čemu rozumí přehrávání alphaTabu. */
  odTiku: number;
  doTiku: number;
  nazevSkladby: string;
  bpm?: number;
  ulozeno: number;
}

/**
 * Převede rozsah taktů na rozsah tiků.
 *
 * Konec úseku je začátek taktu ZA posledním vybraným, ne začátek toho
 * posledního — jinak by se poslední takt nedohrál a smyčka by se vracela
 * o takt dřív.
 *
 * U posledního taktu skladby žádný další začátek není. Bere se tedy konec
 * partitury, a když ani ten není znám, odhadne se délka podle předchozího
 * taktu — dřív z toho vycházela smyčka dlouhá jeden tik, tedy k ničemu.
 */
export function rozsahTiku(
  zacatkyTaktu: number[],
  odTaktu: number,
  doTaktu: number,
  konecTiku?: number,
): { odTiku: number; doTiku: number } | null {
  if (!zacatkyTaktu.length) return null;

  // Tažení zprava doleva je stejný úsek jako zleva doprava.
  let od = Math.min(odTaktu, doTaktu);
  let do_ = Math.max(odTaktu, doTaktu);
  od = Math.max(0, Math.min(od, zacatkyTaktu.length - 1));
  do_ = Math.max(0, Math.min(do_, zacatkyTaktu.length - 1));

  const odTiku = zacatkyTaktu[od];
  const dalsi = zacatkyTaktu[do_ + 1];

  let doTiku: number;
  if (dalsi !== undefined) {
    doTiku = dalsi;
  } else if (konecTiku !== undefined && konecTiku > odTiku) {
    doTiku = konecTiku;
  } else {
    const posledni = zacatkyTaktu[do_];
    const predchozi = zacatkyTaktu[do_ - 1];
    const delkaTaktu = predchozi !== undefined
      ? posledni - predchozi
      : TIKU_NA_CTVRTKU * 4;
    doTiku = posledni + Math.max(1, delkaTaktu);
  }

  // Prázdný ani obrácený rozsah nemá co vracet; smyčka by se zacyklila.
  if (!(doTiku > odTiku)) return null;
  return { odTiku, doTiku };
}

/**
 * Které takty rozsah v tikách zabírá.
 *
 * Výběr tažením po liště padne kamkoli, klidně doprostřed taktu. Na
 * cvičení je to k ničemu — smyčka, která se vrací na půl doby, se nedá
 * chytit. Proto se rozšíří na celé takty, které do výběru zasahují.
 */
export function taktyZTiku(
  zacatkyTaktu: number[],
  odTiku: number,
  doTiku: number,
): { odTaktu: number; doTaktu: number } | null {
  if (!zacatkyTaktu.length) return null;
  const od = Math.min(odTiku, doTiku);
  const do_ = Math.max(odTiku, doTiku);

  /** Poslední takt, který začíná nejpozději v daném tiku. */
  const taktV = (tik: number) => {
    let i = 0;
    for (let j = 0; j < zacatkyTaktu.length; j++) {
      if (zacatkyTaktu[j] <= tik) i = j; else break;
    }
    return i;
  };

  const odTaktu = taktV(od);
  // Konec výběru přesně na hranici taktu patří ještě předchozímu taktu:
  // tažení „přes dva takty" nemá zabrat třetí, kterého se jen dotklo.
  const konec = zacatkyTaktu.indexOf(do_) >= 0 ? do_ - 1 : do_;
  const doTaktu = Math.max(odTaktu, taktV(konec));
  return { odTaktu, doTaktu };
}

type Poslucha = (u: UsekKeCviceni | null) => void;
const posluchaci = new Set<Poslucha>();

export function ulozUsek(u: UsekKeCviceni): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(u));
  } catch {
    /* plné úložiště nesmí shodit předání */
  }
  for (const f of posluchaci) f(u);
}

export function nactiUsek(): UsekKeCviceni | null {
  try {
    const s = localStorage.getItem(KLIC);
    if (!s) return null;
    const u = JSON.parse(s) as UsekKeCviceni;
    // Poškozený nebo starý záznam se chová jako žádný.
    if (!u?.prilohaId || typeof u.odTiku !== 'number' || typeof u.doTiku !== 'number') return null;
    return u;
  } catch {
    return null;
  }
}

export function zapomenUsek(): void {
  try {
    localStorage.removeItem(KLIC);
  } catch {
    /* nevadí */
  }
  for (const f of posluchaci) f(null);
}

export function odebirejUsek(f: Poslucha): () => void {
  posluchaci.add(f);
  f(nactiUsek());
  return () => posluchaci.delete(f);
}

/** Kolik taktů úsek má — pro popisek „5 taktů". */
export function poctuTaktu(u: UsekKeCviceni): number {
  return Math.abs(u.doTaktu - u.odTaktu) + 1;
}
