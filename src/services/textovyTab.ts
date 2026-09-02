import { VstupniDoba, TIKU_NA_CTVRTKU } from './gpUsek';

/**
 * Čtení textové (ASCII) tabulatury.
 *
 * Textový tab říká, na které struně a pražci se co hraje, ale **ne jak
 * dlouho** — rytmus se do něj zapisuje leda mezerami, a to nespolehlivě.
 * Události se proto rozestavují rovnoměrně a aplikace to má říct nahlas,
 * aby si to nikdo nepletl s přesným zápisem z Guitar Pro.
 *
 * Bez závislostí na prohlížeči, ať jde ověřit samostatně.
 */

/** Prázdné struny ve standardním ladění, odshora dolů: e B G D A E. */
export const STANDARDNI_LADENI = [64, 59, 55, 50, 45, 40];

export interface Udalost {
  /** Číslo struny jako v Guitar Pro: 1 je nejvyšší. */
  struna: number;
  prazec: number;
  midi: number;
  /** Sloupec v textu — podle něj se řadí čas. */
  sloupec: number;
}

/**
 * Je řádek tabulaturou?
 *
 * Poznávacím znamením jsou pomlčky a číslice; popisky, akordy nad textem
 * ani prázdné řádky je nemají v takovém poměru.
 */
export function jeRadekTabu(radek: string): boolean {
  const telo = radek.replace(/^\s*[a-gA-G#b]{0,2}\s*\|?/, '');
  if (telo.length < 4) return false;
  const pomlcek = (telo.match(/-/g) || []).length;
  return pomlcek >= telo.length * 0.4;
}

/**
 * Vytáhne z jednoho řádku pražce i s jejich sloupcem.
 *
 * Dvojciferný pražec zabírá dva sloupce a musí se přečíst jako jedno
 * číslo — jinak z „12" vzniknou dva tóny, první a druhý pražec, což je
 * úplně jiná melodie.
 */
export function prazceZRadku(radek: string): { prazec: number; sloupec: number }[] {
  const ven: { prazec: number; sloupec: number }[] = [];
  const re = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(radek)) !== null) {
    ven.push({ prazec: Number(m[0]), sloupec: m.index });
  }
  return ven;
}

/**
 * Rozdělí text na bloky po šesti řádcích tabulatury.
 *
 * Delší tab se píše po soustavách pod sebou; každá je vlastní blok a
 * čas v nich běží za sebou, ne souběžně.
 */
export function blokyTabu(text: string): string[][] {
  const bloky: string[][] = [];
  let soucasny: string[] = [];

  for (const radek of text.split(/\r?\n/)) {
    if (jeRadekTabu(radek)) {
      soucasny.push(radek);
      // Šest strun je plná soustava; sedmý řádek už patří další.
      if (soucasny.length === 6) {
        bloky.push(soucasny);
        soucasny = [];
      }
    } else if (soucasny.length) {
      // Text mezi soustavami blok uzavře, i když nebyl úplný.
      bloky.push(soucasny);
      soucasny = [];
    }
  }
  if (soucasny.length) bloky.push(soucasny);
  return bloky;
}

/**
 * Převede textovou tabulaturu na doby pro hmatník.
 *
 * `naDobu` říká, jak dlouho zní jedna událost. Rytmus v textu není, tak
 * se volí zvenčí — osminy sedí na většinu riffů.
 */
export function tabNaDoby(
  text: string,
  ladeni: number[] = STANDARDNI_LADENI,
  naDobu = TIKU_NA_CTVRTKU / 2,
): VstupniDoba[] {
  const udalosti: Udalost[] = [];
  let posunSloupce = 0;

  for (const blok of blokyTabu(text)) {
    let nejsirsi = 0;
    blok.forEach((radek, i) => {
      // Řádek nad rámec šesti strun by mířil na neexistující ladění.
      if (i >= ladeni.length) return;
      nejsirsi = Math.max(nejsirsi, radek.length);
      for (const p of prazceZRadku(radek)) {
        udalosti.push({
          struna: i + 1,
          prazec: p.prazec,
          midi: ladeni[i] + p.prazec,
          sloupec: posunSloupce + p.sloupec,
        });
      }
    });
    posunSloupce += nejsirsi + 1;
  }

  if (!udalosti.length) return [];

  /**
   * Sloupce se přepočtou na pořadí, ne na čas přímo.
   *
   * V textu bývají mezi tóny nestejné mezery podle toho, jak to komu
   * vyšlo na řádek; brát je jako rytmus by cvičení rozhodilo. Rovnoměrné
   * rozestupy jsou poctivější než předstíraný rytmus.
   */
  const sloupce = [...new Set(udalosti.map((u) => u.sloupec))].sort((a, b) => a - b);
  const poradi = new Map(sloupce.map((s, i) => [s, i]));

  const doby = new Map<number, VstupniDoba>();
  for (const u of udalosti) {
    const cas = (poradi.get(u.sloupec) ?? 0) * naDobu;
    const doba = doby.get(cas);
    const nota = { struna: u.struna, prazec: u.prazec, midi: u.midi };
    if (doba) doba.noty.push(nota);
    else doby.set(cas, { start: cas, delka: naDobu, noty: [nota] });
  }

  return [...doby.values()].sort((a, b) => a.start - b.start);
}
