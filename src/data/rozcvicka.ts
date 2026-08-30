/**
 * Rozcvičovací program před hraním.
 *
 * Kytara je pohyb, ne jen hlava: studená ruka hraje nepřesně a dá se
 * jí ublížit. Program jde od uvolnění přes pravou ruku k souhře obou —
 * v tomhle pořadí, protože přesnost levé ruky nemá cenu trénovat na
 * ruce, která ještě neposlouchá.
 *
 * Metalové rytmy jsou zvlášť: chug se hraje pravou rukou a dusí se
 * dlaní, takže je to jiná dovednost než přebírání.
 */

export interface Cvik {
  id: string;
  nazev: string;
  popis: string;
  /** Co si u toho hlídat — jedna věta, ne přednáška. */
  pozor: string;
  /** Doporučené tempo na začátek a strop, kam se dá dojít. */
  bpmOd: number;
  bpmDo: number;
  /** Kolik vteřin cvičit. */
  vteriny: number;
  /**
   * Rytmus jako šestnáct kroků v taktu; `true` znamená úder.
   * `null` u cviků, kde jde o pohyb, ne o rytmus.
   */
  vzor: boolean[] | null;
}

export interface Blok {
  id: string;
  nazev: string;
  popis: string;
  cviky: Cvik[];
}

/** Zkratka: z čísel kroků udělá šestnáctikrokový vzor. */
const v = (...kroky: number[]): boolean[] =>
  Array.from({ length: 16 }, (_, i) => kroky.includes(i));

export const ROZCVICKA: Blok[] = [
  {
    id: 'uvolneni',
    nazev: '1. Uvolnit ruce',
    popis: 'Bez nástroje. Dvě minuty, které rozhodnou o zbytku hraní.',
    cviky: [
      {
        id: 'krouzeni',
        nazev: 'Kroužení zápěstím',
        popis: 'Deset koleček na každou stranu, oběma rukama zároveň.',
        pozor: 'Pomalu. Když to lupe, zmenši kroužek, ne zrychli.',
        bpmOd: 0, bpmDo: 0, vteriny: 30, vzor: null,
      },
      {
        id: 'prsty',
        nazev: 'Roztažení prstů',
        popis: 'Roztáhni prsty naplno, podrž tři vteřiny, pusť. Osmkrát.',
        pozor: 'Tah v dlani ano, bolest v kloubech ne.',
        bpmOd: 0, bpmDo: 0, vteriny: 40, vzor: null,
      },
      {
        id: 'predlokti',
        nazev: 'Protažení předloktí',
        popis: 'Ruka natažená, dlaň od sebe, druhou rukou přitáhni prsty k tělu.',
        pozor: 'Patnáct vteřin na každou stranu, bez houpání.',
        bpmOd: 0, bpmDo: 0, vteriny: 40, vzor: null,
      },
    ],
  },
  {
    id: 'prava',
    nazev: '2. Pravá ruka',
    popis: 'Trsátko dřív než hmaty. Odsud se bere přesnost i rychlost.',
    cviky: [
      {
        id: 'ctvrtky',
        nazev: 'Prázdná struna na čtvrtky',
        popis: 'Jen dolů, na jedné prázdné struně. Poslouchej, jestli je každý úder stejně silný.',
        pozor: 'Trsátko drž volně. Když jsou úhozy různě hlasité, zpomal.',
        bpmOd: 60, bpmDo: 110, vteriny: 60, vzor: v(0, 4, 8, 12),
      },
      {
        id: 'osminy',
        nazev: 'Osminy střídavě',
        popis: 'Dolů-nahoru. Ruka se hýbe pořád, i když se zrovna nehraje.',
        pozor: 'Pohyb z předloktí, ne z prstů.',
        bpmOd: 70, bpmDo: 130, vteriny: 60, vzor: v(0, 2, 4, 6, 8, 10, 12, 14),
      },
      {
        id: 'sestnactky',
        nazev: 'Šestnáctky',
        popis: 'Čtyři údery na dobu, střídavě. Tady se rozhoduje o rychlosti.',
        pozor: 'Radši pomaleji a čistě. Rozmazané šestnáctky se pak těžko odnaučují.',
        bpmOd: 60, bpmDo: 120, vteriny: 90,
        vzor: v(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
      },
    ],
  },
  {
    id: 'metal',
    nazev: '3. Metalové rytmy',
    popis: 'Chug se dusí dlaní a hraje se z pravé ruky. Od jednoduchých k hustým.',
    cviky: [
      {
        id: 'chug_ctvrtky',
        nazev: 'Chug na čtvrtky',
        popis: 'Prázdná spodní struna, dlaň lehce na kobylce. Jen dolů.',
        pozor: 'Dlaň co nejblíž kobylce. Když to zvoní, posuň ji o kousek dál.',
        bpmOd: 80, bpmDo: 140, vteriny: 60, vzor: v(0, 4, 8, 12),
      },
      {
        id: 'chug_galop',
        nazev: 'Cval (osmina + dvě šestnáctky)',
        popis: 'Klasický Maidenovský cval. Ta-tata, ta-tata.',
        pozor: 'První úder je delší. Když se to slévá, je tempo moc vysoké.',
        bpmOd: 70, bpmDo: 150, vteriny: 90, vzor: v(0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15),
      },
      {
        id: 'chug_obraceny',
        nazev: 'Obrácený cval',
        popis: 'Dvě šestnáctky a osmina — tatata naopak. Kámen úrazu pravé ruky.',
        pozor: 'Hraj to hodně pomalu, dokud to nezní přesně naopak než cval.',
        bpmOd: 60, bpmDo: 140, vteriny: 90, vzor: v(0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14),
      },
      {
        id: 'chug_sestnactky',
        nazev: 'Šestnáctkový chug',
        popis: 'Hustá zeď. Dlaň drží dusítko, ruka jede pořád.',
        pozor: 'Když začne bolet předloktí, okamžitě přestaň a protáhni se.',
        bpmOd: 70, bpmDo: 130, vteriny: 90,
        vzor: v(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
      },
      {
        id: 'chug_synkopa',
        nazev: 'Synkopovaný chug',
        popis: 'Údery mimo dobu — základ modernějšího metalu.',
        pozor: 'Počítej nahlas. Bez počítání se to sesype během dvou taktů.',
        bpmOd: 70, bpmDo: 130, vteriny: 90, vzor: v(0, 3, 6, 8, 11, 14),
      },
    ],
  },
  {
    id: 'obe',
    nazev: '4. Obě ruce dohromady',
    popis: 'Až teď. Levá ruka má smysl, když pravá drží tempo sama od sebe.',
    cviky: [
      {
        id: 'chromatika',
        nazev: 'Chromatika 1–2–3–4',
        popis: 'Prst na pražec, přes všechny struny nahoru a dolů.',
        pozor: 'Prsty nechávej u hmatníku. Zvedat je do výšky stojí čas i sílu.',
        bpmOd: 60, bpmDo: 120, vteriny: 90, vzor: v(0, 2, 4, 6, 8, 10, 12, 14),
      },
      {
        id: 'pentatonika',
        nazev: 'Pentatonika nahoru a dolů',
        popis: 'Molová pentatonika v první poloze, střídavým trsáním.',
        pozor: 'Cílem není rychlost, ale aby každý tón zněl stejně dlouho.',
        bpmOd: 60, bpmDo: 130, vteriny: 90, vzor: v(0, 2, 4, 6, 8, 10, 12, 14),
      },
      {
        id: 'prehmaty',
        nazev: 'Přehmaty přes struny',
        popis: 'Jeden tón na strunu, tam a zpět. Trénuje přesnost trsátka.',
        pozor: 'Dívej se na pravou ruku, ne na levou.',
        bpmOd: 60, bpmDo: 120, vteriny: 60, vzor: v(0, 2, 4, 6, 8, 10, 12, 14),
      },
    ],
  },
];

/** Kolik minut zabere celý program. */
export function delkaProgramu(): number {
  const vteriny = ROZCVICKA.reduce(
    (s, b) => s + b.cviky.reduce((x, c) => x + c.vteriny, 0),
    0,
  );
  return Math.round(vteriny / 60);
}
