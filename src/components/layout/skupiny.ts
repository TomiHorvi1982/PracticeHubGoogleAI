import { MainTabType } from './sekce';

/**
 * Seskupení sekcí do navigace.
 *
 * Aplikace měla devatenáct sekcí v jedné ploché řadě, všechny stejnou
 * vahou. Na 1440px se jich do lišty vešlo čtrnáct a poslední byla
 * useknutá; na mobilu jich bylo osm mimo obrazovku bez náznaku, že se
 * lišta dá posouvat.
 *
 * Dvě sekce zůstávají přímo v liště, protože se do nich chodí nejčastěji
 * a schovat je do rozbalovátka by přidalo klik tam, kde ho nikdo nechce:
 * knihovna je domov a pódium je hraní. Zbytek jsou nástroje, které si
 * člověk otevře, když je potřebuje — ty se seskupily podle toho, co
 * zrovna dělá, ne podle toho, jak jsou postavené.
 */

export interface Polozka {
  id: MainTabType;
  nazev: string;
  /**
   * Sekce, která má domov jinde a v nabídce se neukazuje.
   *
   * Zůstává dosažitelná hlasem a přímým přepnutím, takže se o ni
   * nepřijde — jen nezabírá místo tam, kde je totéž po ruce jinak.
   */
  jenHlasem?: boolean;
}

export interface Skupina {
  id: string;
  nazev: string;
  polozky: Polozka[];
}

/** Sekce, do kterých se chodí nejvíc — zůstávají na jeden klik. */
export const PRIME: { id: MainTabType; nazev: string }[] = [
  { id: 'songbook', nazev: 'Knihovna skladeb' },
  { id: 'podium', nazev: 'Pódium' },
];

export const SKUPINY: Skupina[] = [
  {
    id: 'materialy',
    nazev: 'Noty a texty',
    polozky: [
      { id: 'alphatab', nazev: 'Guitar Pro' },
      { id: 'texty', nazev: 'Texty' },
    ],
  },
  {
    id: 'cviceni',
    nazev: 'Cvičení',
    polozky: [
      { id: 'practise', nazev: 'Practise Hub' },
      { id: 'instruments', nazev: 'Virtual Instruments' },
      // Jmenovalo se to „Metronom", ale sekce vykresluje `PracticeAssistant`
      // — akordové postupy, rytmické vzory a výběr nástroje na 896 řádcích.
      // Metronom je z toho jedna část a název schovával zbytek.
      { id: 'practice', nazev: 'Akordový trenažér' },
      // Ladička tu byla taky a vykreslovala tutéž komponentu jako dolní
      // panel. Teď je jen v panelu, kam patří: ladí se během hraní,
      // ne místo něj. Spouští se z horní lišty.
      { id: 'tuner', nazev: 'Ladička', jenHlasem: true },
    ],
  },
  {
    id: 'zvuk',
    nazev: 'Zvuk',
    polozky: [
      { id: 'stemmixer', nazev: 'Mixážní pult' },
      { id: 'liveamp', nazev: 'Live Guitar Amp' },
    ],
  },
  {
    id: 'archiv',
    nazev: 'Archiv',
    polozky: [
      { id: 'library', nazev: 'Soubory' },
      { id: 'zalozky', nazev: 'Záložky' },
    ],
  },
];

/** Sekce dosažitelné ikonou vpravo — ne nástroje, ale zázemí. */
export const STRANOU: { id: MainTabType; nazev: string }[] = [
  { id: 'vitejte', nazev: 'Rozcestník' },
  { id: 'settings', nazev: 'Nastavení' },
];

/**
 * Ve které skupině sekce leží.
 *
 * Podle toho se zvýrazní rozbalovátko, když je otevřená některá z jeho
 * sekcí — jinak by uživatel po kliknutí ztratil stopu, kde vlastně je.
 */
export function skupinaSekce(tab: MainTabType): string | null {
  return SKUPINY.find((s) => s.polozky.some((p) => p.id === tab))?.id ?? null;
}

/** Položky skupiny, které se v nabídce opravdu ukážou. */
export function viditelnePolozky(s: Skupina): Polozka[] {
  return s.polozky.filter((p) => !p.jenHlasem);
}

/**
 * Všechny sekce dosažitelné z navigace.
 *
 * Existuje kvůli testu: při seskupování je snadné některou sekci tiše
 * vynechat a přijít tak o celou obrazovku, aniž by to cokoli ohlásilo.
 */
export function dosazitelneSekce(): MainTabType[] {
  return [
    ...PRIME.map((p) => p.id),
    ...SKUPINY.flatMap((s) => s.polozky.map((p) => p.id)),
    ...STRANOU.map((p) => p.id),
  ];
}
