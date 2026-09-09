import { STANDARDNI_LADENI, TONY, midiNaPrazci } from './cvikyTechnik';
import { Nahoda, zamichej } from './pracovniListy';

/**
 * Kvízy.
 *
 * Tři druhy otázek, protože tři různé věci se ověřují jinak:
 * pojmy výběrem, sluch poslechem, orientace po krku ťuknutím do hmatníku.
 *
 * Psané otázky na pojmy leží v databázi a přidává si je učitel sám.
 * Poslechové a hmatníkové se počítají tady — zásoba je tím neomezená a
 * dítě nedostane potřetí tutéž otázku, kterou si zapamatovalo i s pořadím
 * odpovědí.
 *
 * Bez databáze i bez zvuku: tenhle modul říká, co se má zahrát a co je
 * správně. Přehrát to je věc komponenty.
 */

export type DruhOtazky = 'vyber' | 'poslech' | 'hmatnik';

export interface Otazka {
  id: string;
  druh: DruhOtazky;
  text: string;
  moznosti: string[];
  /** Pořadí správné odpovědi v `moznosti`. */
  spravne: number;
  /** Co zahrát, než se dítě rozhodne. Jen u poslechu. */
  tony?: number[];
  /** Zní tóny naráz (akord), nebo po sobě (interval)? */
  spolu?: boolean;
  napoveda?: string;
}

/** Intervaly, které má smysl rozeznávat sluchem, i s českým jménem. */
export const INTERVALY: { pultonu: number; nazev: string }[] = [
  { pultonu: 2, nazev: 'velká sekunda' },
  { pultonu: 3, nazev: 'malá tercie' },
  { pultonu: 4, nazev: 'velká tercie' },
  { pultonu: 5, nazev: 'čistá kvarta' },
  { pultonu: 7, nazev: 'čistá kvinta' },
  { pultonu: 9, nazev: 'velká sexta' },
  { pultonu: 12, nazev: 'oktáva' },
];

/**
 * Kolik intervalů se nabídne podle stupně.
 *
 * Devítileté dítě, které dostane na výběr ze sedmi intervalů, hádá.
 * Ve třetím stupni se učí tercie a kvinty, tak se z nich vybírá.
 */
function intervalyProStupen(stupen: number) {
  if (stupen <= 2) return INTERVALY.filter((i) => [5, 7, 12].includes(i.pultonu));
  if (stupen <= 4) return INTERVALY.filter((i) => i.pultonu !== 9);
  return INTERVALY;
}

/** Náhodný prvek. Prázdné pole vrací `undefined` — volající to hlídá. */
function nahodny<T>(pole: T[], nahoda: Nahoda): T {
  return pole[Math.floor(nahoda() * pole.length)];
}

/**
 * Otázka na interval.
 *
 * Tóny jdou po sobě, ne naráz: souzvuk se pozná podle barvy, kdežto
 * dva tóny za sebou se dají dozpívat — a o to jde.
 */
export function otazkaInterval(stupen: number, nahoda: Nahoda): Otazka {
  const nabidka = intervalyProStupen(stupen);
  const spravny = nahodny(nabidka, nahoda);
  // Základ někde uprostřed krku, ať to nezní ani jako bas, ani jako pískot.
  const zaklad = 52 + Math.floor(nahoda() * 8);

  const moznosti = zamichej(nabidka.map((i) => i.nazev), nahoda);
  return {
    id: `interval-${spravny.pultonu}-${zaklad}`,
    druh: 'poslech',
    text: 'Jaký interval slyšíš?',
    moznosti,
    spravne: moznosti.indexOf(spravny.nazev),
    tony: [zaklad, zaklad + spravny.pultonu],
    spolu: false,
    napoveda: 'Zkus si druhý tón dozpívat od prvního.',
  };
}

/**
 * Dur nebo moll.
 *
 * Nejužitečnější poslechová otázka vůbec: rozdíl mezi veselým a smutným
 * akordem slyší i dítě, které o teorii neví nic, a od téhle otázky se
 * dá vyjít ke všemu ostatnímu.
 */
export function otazkaAkord(nahoda: Nahoda): Otazka {
  const dur = nahoda() < 0.5;
  const zaklad = 48 + Math.floor(nahoda() * 12);
  const moznosti = nahoda() < 0.5 ? ['dur (veselý)', 'moll (smutný)'] : ['moll (smutný)', 'dur (veselý)'];
  return {
    id: `akord-${dur ? 'dur' : 'moll'}-${zaklad}`,
    druh: 'poslech',
    text: 'Je ten akord dur, nebo moll?',
    moznosti,
    spravne: moznosti.indexOf(dur ? 'dur (veselý)' : 'moll (smutný)'),
    tony: [zaklad, zaklad + (dur ? 4 : 3), zaklad + 7],
    spolu: true,
    napoveda: 'Dur zní vesele, moll smutně. Poslechni si to dvakrát.',
  };
}

/**
 * Kde na hmatníku leží zadaný tón.
 *
 * Odpovědi jsou popisy místa, ne obrázek — dítě si je přeloží na krk
 * samo, což je přesně ta dovednost, o kterou jde.
 */
export function otazkaHmatnik(stupen: number, nahoda: Nahoda): Otazka {
  // Vyšší stupně sahají dál po krku; první dva zůstávají u prvních pražců.
  const maxPrazec = stupen <= 2 ? 5 : stupen <= 4 ? 9 : 12;
  const struna = Math.floor(nahoda() * 6);
  const prazec = Math.floor(nahoda() * (maxPrazec + 1));
  const jmenaStrun = ['E (nejsilnější)', 'A', 'D', 'G', 'H', 'e (nejtenčí)'];
  const midi = midiNaPrazci(struna, prazec, STANDARDNI_LADENI);
  const ton = TONY[((midi % 12) + 12) % 12];

  const spatne: string[] = [];
  while (spatne.length < 3) {
    const s = Math.floor(nahoda() * 6);
    const p = Math.floor(nahoda() * (maxPrazec + 1));
    const popis = `${jmenaStrun[s]}, ${p}. pražec`;
    const jinyTon = TONY[((midiNaPrazci(s, p, STANDARDNI_LADENI) % 12) + 12) % 12];
    // Špatná odpověď nesmí být taky správná — týž tón leží na krku víckrát.
    if (jinyTon !== ton && !spatne.includes(popis)) spatne.push(popis);
  }

  const spravnyPopis = `${jmenaStrun[struna]}, ${prazec}. pražec`;
  const moznosti = zamichej([spravnyPopis, ...spatne], nahoda);
  return {
    id: `hmatnik-${struna}-${prazec}`,
    druh: 'hmatnik',
    text: `Kde leží tón ${ton}?`,
    moznosti,
    spravne: moznosti.indexOf(spravnyPopis),
    napoveda: 'Prázdné struny jsou odspodu E A D G H e.',
  };
}

/**
 * Kvíz pro stupeň.
 *
 * Míchají se druhy: pár psaných otázek z databáze, k tomu poslech
 * a hmatník. Kvíz ze samých pojmů ověří paměť, ne hudebníka.
 */
export function sestavKviz(
  psane: Otazka[],
  stupen: number,
  pocet: number,
  nahoda: Nahoda,
): Otazka[] {
  const generovane: Otazka[] = [
    otazkaInterval(stupen, nahoda),
    otazkaAkord(nahoda),
    otazkaHmatnik(stupen, nahoda),
  ];
  // Psaných nanejvýš tolik, aby zbylo místo na to, co se poslouchá a hraje.
  const kolikPsanych = Math.max(0, Math.min(psane.length, pocet - generovane.length));
  const vybrane = zamichej(psane, nahoda).slice(0, kolikPsanych);
  return zamichej([...vybrane, ...generovane], nahoda).slice(0, Math.max(1, pocet));
}

/** Kolik odpovědí sedí. */
export function vyhodnot(otazky: Otazka[], odpovedi: (number | null)[]): number {
  return otazky.reduce((n, o, i) => n + (odpovedi[i] === o.spravne ? 1 : 0), 0);
}
