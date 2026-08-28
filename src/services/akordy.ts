import { Chord } from 'tonal';

/**
 * Pojmenování akordu z tónů, které v něm zazní.
 *
 * Když si člověk naťuká akord na hmatníku nebo na klaviatuře, appka musí
 * poznat, co to je. Není na to potřeba nic poslouchat — akord je daný tóny,
 * které obsahuje, a jejich vzdálenostmi od základního tónu. Rozpoznat ho
 * ze zvuku by znamenalo hádat to, co už bezpečně víme.
 */

export const TONY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Ladění strun odspodu nahoru, v číslech MIDI. Standardní E. */
export const STRUNY_STANDARD = [40, 45, 50, 55, 59, 64];

/**
 * Ladění z názvů tónů typu `['E2','A2','D3','G3','B3','E4']`.
 *
 * Bez toho by se akord vyhodnocoval vždycky ve standardním E — a kdo hraje
 * v Drop C, dostal by ke svému hmatu jméno akordu, který nehraje.
 */
export function strunyZNot(noty: string[]): number[] {
  const prevod = noty.map((n) => {
    const m = String(n).match(/^([A-G])(#|b)?(-?\d)$/);
    if (!m) return null;
    const zaklad = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]]!;
    const posun = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return (Number(m[3]) + 1) * 12 + zaklad + posun;
  });
  // Jediná nepřečtená struna znamená, že celé ladění neznáme — počítat
  // půlku podle zadání a půlku podle standardu by dalo nesmysl.
  return prevod.every((x): x is number => x !== null) && prevod.length === 6
    ? (prevod as number[])
    : STRUNY_STANDARD;
}

/**
 * Vzorce akordů, seřazené od nejurčitějších.
 *
 * Pořadí rozhoduje: 0,4,7,10 je sedmička, ale obsahuje i 0,4,7. Kdyby se
 * hledalo od nejkratších, každá sedmička by vyšla jako durový akord
 * s tónem navíc.
 */
const VZORCE: { intervaly: number[]; pripona: string; popis: string }[] = [
  { intervaly: [0, 2, 4, 7, 11], pripona: 'maj9', popis: 'velká nónový' },
  { intervaly: [0, 2, 4, 7, 10], pripona: '9', popis: 'nónový' },
  { intervaly: [0, 2, 3, 7, 10], pripona: 'm9', popis: 'mollový nónový' },
  { intervaly: [0, 3, 6, 9], pripona: 'dim7', popis: 'zmenšený septakord' },
  { intervaly: [0, 3, 6, 10], pripona: 'm7b5', popis: 'polozmenšený' },
  { intervaly: [0, 4, 7, 11], pripona: 'maj7', popis: 'velký septakord' },
  { intervaly: [0, 3, 7, 11], pripona: 'm(maj7)', popis: 'mollový s velkou septimou' },
  { intervaly: [0, 4, 7, 10], pripona: '7', popis: 'septakord' },
  { intervaly: [0, 3, 7, 10], pripona: 'm7', popis: 'mollový septakord' },
  { intervaly: [0, 5, 7, 10], pripona: '7sus4', popis: 'septakord se sus4' },
  { intervaly: [0, 4, 7, 9], pripona: '6', popis: 'sexta' },
  { intervaly: [0, 3, 7, 9], pripona: 'm6', popis: 'mollová sexta' },
  { intervaly: [0, 2, 4, 7], pripona: 'add9', popis: 's přidanou nónou' },
  { intervaly: [0, 2, 3, 7], pripona: 'madd9', popis: 'mollový s nónou' },
  { intervaly: [0, 4, 8], pripona: 'aug', popis: 'zvětšený' },
  { intervaly: [0, 3, 6], pripona: 'dim', popis: 'zmenšený' },
  { intervaly: [0, 2, 7], pripona: 'sus2', popis: 'sus2' },
  { intervaly: [0, 5, 7], pripona: 'sus4', popis: 'sus4' },
  { intervaly: [0, 4, 7], pripona: '', popis: 'durový' },
  { intervaly: [0, 3, 7], pripona: 'm', popis: 'mollový' },
  { intervaly: [0, 7], pripona: '5', popis: 'kvintakord' },
  { intervaly: [0, 4], pripona: '(bez kvinty)', popis: 'durový bez kvinty' },
  { intervaly: [0, 3], pripona: 'm(bez kvinty)', popis: 'mollový bez kvinty' },
];

export interface Rozpoznany {
  nazev: string;
  popis: string;
  /** Tóny akordu bez oktáv, pro výpis. */
  tony: string[];
  /** Jistota: `presne` sedí vzorec na tón, `pribuzne` je nejbližší shoda. */
  jistota: 'presne' | 'pribuzne';
}

/**
 * Pojmenuje akord z čísel MIDI.
 *
 * Nejnižší tón se zkusí jako základní první — tak akord skoro vždycky
 * zní a člověk ho tak i hmatá. Když na něm žádný vzorec nesedí, zkusí se
 * ostatní tóny jako základ a výsledek se pozná podle obratu.
 */
export function pojmenujAkord(midi: number[]): Rozpoznany | null {
  /**
   * Nejdřív se zeptáme knihovny.
   *
   * Vlastní tabulka zná dvacet vzorců; `tonal` jich má stovky včetně
   * alterací a nadstaveb, které si bez ní kapela nepojmenuje. Vlastní
   * hledání zůstává jako záloha — pozná obraty s basem a když nesedí nic
   * přesně, nabídne nejbližší tvar, což knihovna nedělá.
   */
  const zTonal = pojmenujPresTonal(midi);
  if (zTonal) return zTonal;

  const unikatni = [...new Set(midi.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
  if (unikatni.length < 2) {
    return unikatni.length === 1
      ? { nazev: TONY[unikatni[0]], popis: 'jeden tón', tony: [TONY[unikatni[0]]], jistota: 'presne' }
      : null;
  }

  const nejnizsi = ((Math.min(...midi) % 12) + 12) % 12;
  // Basový tón napřed, zbytek podle výšky — obraty se pak poznají podle
  // toho, že vyhraje jiný základ než ten nejnižší.
  const poradi = [nejnizsi, ...unikatni.filter((t) => t !== nejnizsi)];

  for (const zaklad of poradi) {
    const intervaly = unikatni.map((t) => (t - zaklad + 12) % 12).sort((a, b) => a - b);
    for (const v of VZORCE) {
      if (
        v.intervaly.length === intervaly.length &&
        v.intervaly.every((x, i) => x === intervaly[i])
      ) {
        const nazev = TONY[zaklad] + v.pripona;
        const obrat = zaklad !== nejnizsi ? `/${TONY[nejnizsi]}` : '';
        return {
          nazev: nazev + obrat,
          popis: obrat ? `${v.popis}, obrat s basem ${TONY[nejnizsi]}` : v.popis,
          tony: unikatni.map((t) => TONY[t]),
          jistota: 'presne',
        };
      }
    }
  }

  // Nic nesedí přesně. Místo „neznámý akord" se nabídne nejbližší vzorec —
  // s jasně přiznanou nejistotou, ať se na to nikdo nespoléhá.
  let nej: { nazev: string; popis: string; chyb: number } | null = null;
  for (const zaklad of poradi) {
    const intervaly = new Set(unikatni.map((t) => (t - zaklad + 12) % 12));
    for (const v of VZORCE) {
      const chybi = v.intervaly.filter((x) => !intervaly.has(x)).length;
      const navic = [...intervaly].filter((x) => !v.intervaly.includes(x)).length;
      const chyb = chybi + navic;
      if (!nej || chyb < nej.chyb) {
        nej = { nazev: TONY[zaklad] + v.pripona, popis: v.popis, chyb };
      }
    }
  }

  return nej
    ? {
        nazev: nej.nazev,
        popis: `nejblíž je ${nej.popis}`,
        tony: unikatni.map((t) => TONY[t]),
        jistota: 'pribuzne',
      }
    : null;
}

/** Pojmenování knihovnou `tonal`; `null`, když si neví rady. */
function pojmenujPresTonal(midi: number[]): Rozpoznany | null {
  const unikatni = [...new Set(midi.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
  if (unikatni.length < 3) return null;

  const nejnizsi = ((Math.min(...midi) % 12) + 12) % 12;
  // Bas napřed: `tonal` z pořadí pozná obrat a pojmenuje ho lomítkem.
  const tony = [TONY[nejnizsi], ...unikatni.filter((t) => t !== nejnizsi).map((t) => TONY[t])];

  const nalezy = Chord.detect(tony);
  if (!nalezy.length) return null;

  // `tonal` píše dur příponou „M" — vyjde z toho „CM" a „EM". Kapela
  // takový zápis nepoužívá a v seznamu akordů by ho četla jako chybu;
  // čisté dur se píše samotným tónem.
  const nazev = nalezy[0].replace(/^([A-G][#b]?)M(?![a-z0-9])/, '$1');
  const info = Chord.get(nalezy[0]);
  return {
    nazev,
    popis: info.name || info.type || 'akord',
    tony: unikatni.map((t) => TONY[t]),
    jistota: 'presne',
  };
}

/** Tóny akordu z hmatu na hmatníku. `-1` je dusená struna. */
export function tonyZHmatu(prahy: number[], struny: number[] = STRUNY_STANDARD): number[] {
  return prahy
    .map((p, i) => (p < 0 ? null : struny[i] + p))
    .filter((m): m is number => m !== null);
}

/**
 * Hmat na hmatníku pro zadané tóny.
 *
 * Hledá nejnižší polohu, kde jde akord zahmatat v rozsahu čtyř pražců —
 * dál po krku už to není hmat pro začátek písně, ale cvičení.
 */
export function hmatProTony(tridy: number[], struny: number[] = STRUNY_STANDARD): number[] | null {
  if (tridy.length === 0) return null;
  const chtene = new Set(tridy.map((t) => ((t % 12) + 12) % 12));

  for (let zaklad = 0; zaklad <= 12; zaklad++) {
    const prahy = struny.map((s) => {
      // Prázdná struna se počítá taky, když sedí do akordu.
      for (let p = zaklad === 0 ? 0 : zaklad; p <= zaklad + 4; p++) {
        if (chtene.has((s + p) % 12)) return p;
      }
      return -1;
    });
    const znejici = prahy.filter((p) => p >= 0);
    if (znejici.length < 3) continue;
    const pokryte = new Set(
      prahy.map((p, i) => (p < 0 ? -1 : (struny[i] + p) % 12)).filter((t) => t >= 0)
    );
    if ([...chtene].every((t) => pokryte.has(t))) return prahy;
  }
  return null;
}

/**
 * Základní tón z českého i anglického zápisu.
 *
 * V češtině je `H` anglické B a `B` je béčko, tedy A#. Řetězit dvě záměny
 * za sebou nejde: `H` by se přepsalo na `B` a to hned nato na `A#`, takže
 * by H skončilo o půltón níž, než má.
 */
const ZAKLADY: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 10, H: 11,
};

/** Tóny akordu podle názvu, jako čísla MIDI ve střední oktávě. */
export function tonyZNazvu(nazev: string): number[] | null {
  const m = nazev.trim().match(/^([A-H][#b]?)(.*)$/);
  if (!m) return null;

  const idx = ZAKLADY[m[1]];
  if (idx === undefined) return null;

  const pripona = m[2].replace(/\/[A-H][#b]?$/, '').trim();
  const v = VZORCE.find((x) => x.pripona.toLowerCase() === pripona.toLowerCase());
  const intervaly = v ? v.intervaly : pripona.startsWith('m') ? [0, 3, 7] : [0, 4, 7];
  return intervaly.map((i) => 60 + idx + i);
}

/**
 * O kolik půltónů transponovat, aby píseň zněla v cílové tónině.
 *
 * Vybírá se kratší cesta: do C z H se jde o půltón nahoru, ne o jedenáct
 * dolů. Zpívá se to stejně, ale hmaty na krku jsou úplně jinde.
 *
 * Durové a mollové značení se ignoruje — posun je daný jen základním
 * tónem. `Am` na `Cm` je +3 stejně jako `A` na `C`.
 */
export function posunDoToniny(zeSongu: string, cil: string): number | null {
  const zaklad = (t: string) => {
    const m = String(t || '').trim().match(/^([A-H][#b]?)/);
    return m ? ZAKLADY[m[1]] : undefined;
  };
  const a = zaklad(zeSongu);
  const b = zaklad(cil);
  if (a === undefined || b === undefined) return null;

  const rozdil = (b - a + 12) % 12;
  return rozdil > 6 ? rozdil - 12 : rozdil;
}
