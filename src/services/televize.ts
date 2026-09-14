/**
 * Televize v učebně — co se na ni posílá a jak se to počítá.
 *
 * Televize je druhé okno prohlížeče na druhém displeji (HDMI). Není to
 * prezentace se slajdy, ale zrcadlo vybrané části aplikace: kdo chystá
 * slajdy zvlášť, dělá práci dvakrát a materiál se mu rozejde s tím, co
 * v aplikaci stejně je.
 *
 * Okna spolu mluví přes `BroadcastChannel` (viz `televizeKanal.ts`).
 * Tady jsou jen tvary zpráv a výpočty, bez prohlížeče, aby šly ověřit
 * testem.
 *
 * Televize je němá. Kdyby metronom klepal v obou oknech, rozešly by se
 * o pár milisekund a byla by z toho ozvěna — zvuk zůstává na počítači
 * učitele a televize jen ukazuje.
 */

import type { DruhListu } from '../components/vyuka/PracovniListy';

export type Vystup =
  | { druh: 'prazdno' }
  | { druh: 'akord'; nazev: string }
  | { druh: 'stupnice'; zaklad: number; stupniceId: string }
  | { druh: 'metronom'; bpm: number; dobVTaktu: number; zacatek: number | null }
  | { druh: 'text'; nadpis: string; text: string }
  | { druh: 'list'; stupen: number; list: DruhListu; semeno: number }
  | { druh: 'obrazek'; url: string; popis: string };

export type Zprava =
  /** Ovládání posílá, co má být na televizi. */
  | { typ: 'vystup'; vystup: Vystup }
  /** Televize se právě otevřela nebo načetla znovu a chce vědět, co ukazovat. */
  | { typ: 'ahoj' }
  /** Televize žije. Podle toho ovládání pozná, jestli je okno otevřené. */
  | { typ: 'zije'; celaObrazovka: boolean };

export const NAZEV_KANALU = 'neverlast-televize';

/** Jak často se televize hlásí a kdy ji ovládání prohlásí za zavřenou. */
export const TEP_MS = 2000;
export const TICHO_MS = 6000;

export const NAZVY_VYSTUPU: Record<Vystup['druh'], string> = {
  prazdno: 'Prázdno',
  akord: 'Akord',
  stupnice: 'Stupnice na hmatníku',
  metronom: 'Metronom',
  text: 'Text',
  list: 'Pracovní list',
  obrazek: 'Obrázek',
};

const LISTY: DruhListu[] = ['osmismerka', 'spojovacka', 'hmatnik', 'tabulatura', 'kruh', 'bingo'];

const cislo = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;

/**
 * Obrázek jen z adresy, kterou televize opravdu načte.
 *
 * `blob:` adresy patří jednomu dokumentu, takže v druhém okně nevedou
 * nikam; `javascript:` a podobné do `src` obrázku nepatří vůbec.
 */
export function platnaAdresaObrazku(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
  } catch {
    return false;
  }
}

/**
 * Je tohle výstup, který televize umí ukázat?
 *
 * Zprávy chodí z jiného okna. Stejný původ sice znamená, že je poslala
 * naše aplikace, ale starší verze v jiné záložce může posílat jiný tvar —
 * a rozbitá zpráva nemá shodit obrazovku, na kterou kouká dítě.
 */
export function platnyVystup(x: unknown): x is Vystup {
  if (!x || typeof x !== 'object') return false;
  const v = x as Record<string, unknown>;
  switch (v.druh) {
    case 'prazdno':
      return true;
    case 'akord':
      return text(v.nazev, 20) && v.nazev.length > 0;
    case 'stupnice':
      return cislo(v.zaklad) && v.zaklad >= 0 && v.zaklad <= 127 && text(v.stupniceId, 40);
    case 'metronom':
      return cislo(v.bpm) && v.bpm >= 20 && v.bpm <= 400
        && cislo(v.dobVTaktu) && v.dobVTaktu >= 1 && v.dobVTaktu <= 16
        && (v.zacatek === null || cislo(v.zacatek));
    case 'text':
      return text(v.nadpis, 200) && text(v.text, 20000);
    case 'list':
      return cislo(v.stupen) && v.stupen >= 1 && v.stupen <= 6
        && LISTY.includes(v.list as DruhListu) && cislo(v.semeno);
    case 'obrazek':
      return text(v.url, 4000) && platnaAdresaObrazku(v.url) && text(v.popis, 200);
    default:
      return false;
  }
}

export function platnaZprava(x: unknown): x is Zprava {
  if (!x || typeof x !== 'object') return false;
  const z = x as Record<string, unknown>;
  if (z.typ === 'ahoj') return true;
  if (z.typ === 'zije') return typeof z.celaObrazovka === 'boolean';
  if (z.typ === 'vystup') return platnyVystup(z.vystup);
  return false;
}

/**
 * Kde je metronom na televizi.
 *
 * Počítá se z hodin, ne z tiků: obě okna běží na stejném počítači,
 * takže `Date.now()` mají stejné, kdežto `performance.now()` má každý
 * dokument vlastní počátek a přenášet ho by nedávalo smysl.
 *
 * Vrací dobu v taktu od jedné (tak se počítá nahlas) a jak daleko je
 * uvnitř doby, 0–1, na zhasínání záblesku.
 */
export function dobaMetronomu(
  bpm: number,
  dobVTaktu: number,
  zacatek: number | null,
  ted: number,
): { doba: number; uvnitr: number } | null {
  if (zacatek === null || bpm <= 0 || dobVTaktu < 1) return null;
  const uplynulo = ted - zacatek;
  if (uplynulo < 0) return { doba: 1, uvnitr: 0 };
  const dob = uplynulo / (60000 / bpm);
  return {
    doba: (Math.floor(dob) % dobVTaktu) + 1,
    uvnitr: dob - Math.floor(dob),
  };
}

/**
 * Změnil se metronom natolik, že ho má cenu poslat znovu?
 *
 * Začátek se na počítači učitele dopočítává z pozice, a ta při každém
 * odečtu vyjde o pár milisekund jinak. Posílat to pokaždé by televizi
 * zbytečně rozkmitalo; pod dvaceti milisekundami to oko nepozná.
 */
export function metronomSeZmenil(
  a: Extract<Vystup, { druh: 'metronom' }>,
  b: Extract<Vystup, { druh: 'metronom' }>,
): boolean {
  if (a.bpm !== b.bpm || a.dobVTaktu !== b.dobVTaktu) return true;
  if ((a.zacatek === null) !== (b.zacatek === null)) return true;
  if (a.zacatek !== null && b.zacatek !== null) return Math.abs(a.zacatek - b.zacatek) > 20;
  return false;
}

export interface ZnackaHmatniku {
  struna: number;
  prazec: number;
  /** Základní tón stupnice — ten se na televizi svítí jinak. */
  koren: boolean;
}

/**
 * Všechny tóny stupnice na krku až po zadaný pražec.
 *
 * Na televizi má dítě vidět celou mapu, ne jednu polohu: z dálky si
 * přečte tvar, který se po krku opakuje, a to je smysl téhle obrazovky.
 */
export function znackyStupnice(
  zaklad: number,
  kroky: number[],
  ladeni: number[],
  prazcu = 12,
): ZnackaHmatniku[] {
  const tridy = new Set(kroky.map((k) => ((k % 12) + 12) % 12));
  const zakladTrida = ((zaklad % 12) + 12) % 12;
  const znacky: ZnackaHmatniku[] = [];
  ladeni.forEach((prazdna, struna) => {
    for (let prazec = 0; prazec <= prazcu; prazec++) {
      const odZakladu = (((prazdna + prazec - zakladTrida) % 12) + 12) % 12;
      if (tridy.has(odZakladu)) znacky.push({ struna, prazec, koren: odZakladu === 0 });
    }
  });
  return znacky;
}

/**
 * Text písně rozdělený na řádky s akordy.
 *
 * Zpěvník drží akordy v hranatých závorkách uvnitř textu. Na televizi se
 * zvednou nad slovo, ke kterému patří — tak se to čte při hraní.
 */
export function rozdelTextSAkordy(radek: string): { akord: string | null; slova: string }[] {
  const casti: { akord: string | null; slova: string }[] = [];
  const re = /\[([^\]]{1,12})\]/g;
  let posledni = 0;
  let akord: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(radek)) !== null) {
    const pred = radek.slice(posledni, m.index);
    if (pred || akord) casti.push({ akord, slova: pred });
    akord = m[1];
    posledni = m.index + m[0].length;
  }
  const zbytek = radek.slice(posledni);
  if (zbytek || akord) casti.push({ akord, slova: zbytek });
  return casti.length ? casti : [{ akord: null, slova: '' }];
}
