/**
 * Úsek tabulatury k procvičení.
 *
 * Z partitury se vybere rozsah taktů a udělá se z něj posloupnost tónů
 * i s tím, na které struně a pražci se hrají — to je informace, kterou
 * Guitar Pro nese a notový zápis ne, a přitom je to jediné, co
 * kytaristu při cvičení zajímá.
 *
 * Vstup je záměrně obyčejná data, ne objekty alphaTabu: díky tomu jde
 * celý výpočet ověřit bez načtené partitury.
 */

export interface VstupniNota {
  /** Číslo struny podle alphaTabu — 1 je nejvyšší. */
  struna: number;
  prazec: number;
  midi: number;
}

export interface VstupniDoba {
  /** Začátek v tikách od začátku skladby. */
  start: number;
  delka: number;
  noty: VstupniNota[];
}

export interface UsekNota {
  /** Čas od začátku úseku v tikách — úsek se cvičí sám o sobě. */
  cas: number;
  delka: number;
  struna: number;
  prazec: number;
  midi: number;
}

export interface Usek {
  noty: UsekNota[];
  /** Délka úseku v tikách; podle ní se smyčka vrací na začátek. */
  delka: number;
}

/**
 * Vybere noty spadající do rozsahu taktů.
 *
 * Doba se bere podle svého začátku: nota, která do úseku zasahuje jen
 * doznívajícím koncem, do cvičení nepatří — začíná jinde a hráč ji
 * v úseku nikdy nezahraje.
 */
export function usekZDob(doby: VstupniDoba[], odTiku: number, doTiku: number): Usek {
  if (doTiku <= odTiku) return { noty: [], delka: 0 };

  const noty: UsekNota[] = [];
  for (const d of doby) {
    if (d.start < odTiku || d.start >= doTiku) continue;
    for (const n of d.noty) {
      noty.push({
        cas: d.start - odTiku,
        delka: d.delka,
        struna: n.struna,
        prazec: n.prazec,
        midi: n.midi,
      });
    }
  }

  noty.sort((a, b) => a.cas - b.cas || a.struna - b.struna);
  return { noty, delka: doTiku - odTiku };
}

/**
 * Převede tiky na vteřiny.
 *
 * AlphaTab počítá s 960 tiky na čtvrťovou notu. Tempo se dá měnit za
 * běhu, takže se převádí až při přehrávání, ne při výběru úseku.
 */
export const TIKU_NA_CTVRTKU = 960;

export function tikyNaVteriny(tiky: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return (tiky / TIKU_NA_CTVRTKU) * (60 / bpm);
}

/**
 * Noty seskupené podle času.
 *
 * Akord je několik not ve stejnou chvíli; na hmatníku se musí rozsvítit
 * naráz, ne po jedné. Bez seskupení by se hmat ukázal jako sled
 * jednotlivých tónů.
 */
export function poDobach(noty: UsekNota[]): { cas: number; noty: UsekNota[] }[] {
  const mapa = new Map<number, UsekNota[]>();
  for (const n of noty) {
    const skupina = mapa.get(n.cas);
    if (skupina) skupina.push(n);
    else mapa.set(n.cas, [n]);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cas, noty]) => ({ cas, noty }));
}
