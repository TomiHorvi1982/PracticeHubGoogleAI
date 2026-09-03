/**
 * Analýza nahrávky: co o ní jde říct z jejích vzorků.
 *
 * Tahle čísla dřív chodila hotová ze StemDecku. Když se na něj přestalo
 * spoléhat, musí se spočítat tady — a všechna pracují nad prostým polem
 * vzorků, ne nad `AudioBuffer`, aby se daly ověřit i mimo prohlížeč.
 */

import { chromaZeSpektra } from './porovnaniHry';
import { snimkySpektra, VYCHOZI_SNIMKY } from './spektrum';

/** Nejvyšší výchylka. */
export function spicka(data: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] < 0 ? -data[i] : data[i];
    if (v > m) m = v;
  }
  return m;
}

/** Efektivní hodnota — to, co ucho vnímá jako hlasitost líp než špička. */
export function rms(data: ArrayLike<number>): number {
  if (!data.length) return 0;
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return Math.sqrt(s / data.length);
}

/**
 * Decibely z poměru.
 *
 * Ticho nemá logaritmus, takže místo `-Infinity` vrací −120 dB: v pruhu
 * s údaji je „−120" čitelné, kdežto „−∞" rozbíjí zarovnání sloupců.
 */
export function naDb(pomer: number): number {
  if (!(pomer > 0)) return -120;
  return Math.max(-120, 20 * Math.log10(pomer));
}

/**
 * Dynamický rozsah jako odstup špičky od efektivní hodnoty.
 *
 * Není to DR podle EBU, na to je potřeba měřit po úsecích; tohle je
 * činitel výkyvu (crest factor). U zmáčknutého moderního mixu vyjde
 * kolem 8 dB, u nahrávky s dynamikou přes 15.
 */
export function dynamickyRozsah(data: ArrayLike<number>): number {
  const s = spicka(data);
  const r = rms(data);
  if (!(s > 0) || !(r > 0)) return 0;
  return Math.max(0, naDb(s) - naDb(r));
}

/**
 * Hlasitost podle ITU-R BS.1770, zjednodušeně.
 *
 * Plné měření chce K-váhování dvěma filtry a hradlování po blocích.
 * Tady je K-váhování zachované (bez něj vycházejí basové mixy hlasitěji,
 * než jak zní) a hradlování zjednodušené na jeden práh −70 LUFS, což
 * pro pruh s údaji stačí. Není to certifikované měřidlo a nesmí se tak
 * vydávat.
 */
export function hlasitostLufs(data: ArrayLike<number>, vzorkovaci: number): number {
  if (!data.length || !(vzorkovaci > 0)) return -120;

  // K-váhování: horní police kolem 1,5 kHz a horní propust kolem 38 Hz.
  // Koeficienty se dopočítávají ze vzorkovací frekvence, ne z tabulky pro
  // 48 kHz — jinak by měření na 44,1 kHz sedělo o kus vedle.
  const vazene = kVahovani(data, vzorkovaci);

  // Bloky po 400 ms se sedmdesátiprocentním překryvem, jak žádá norma.
  const blok = Math.max(1, Math.floor(vzorkovaci * 0.4));
  const krok = Math.max(1, Math.floor(blok * 0.25));
  const hlasitosti: number[] = [];
  for (let i = 0; i + blok <= vazene.length; i += krok) {
    let s = 0;
    for (let j = i; j < i + blok; j++) s += vazene[j] * vazene[j];
    const stred = s / blok;
    if (stred > 0) hlasitosti.push(-0.691 + 10 * Math.log10(stred));
  }
  if (!hlasitosti.length) return -120;

  // Absolutní práh: ticho mezi frázemi nemá stahovat výsledek dolů.
  const nadPrahem = hlasitosti.filter((h) => h > -70);
  const pouzite = nadPrahem.length ? nadPrahem : hlasitosti;
  const soucet = pouzite.reduce((a, h) => a + Math.pow(10, h / 10), 0);
  return Math.max(-120, 10 * Math.log10(soucet / pouzite.length));
}

/** Dvojice filtrů K-váhování. */
function kVahovani(data: ArrayLike<number>, vzorkovaci: number): Float32Array {
  const ven = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) ven[i] = data[i];

  // 1) Horní police +4 dB od 1500 Hz — napodobuje hlavu posluchače.
  police(ven, vzorkovaci, 1500, 4, 0.7071);
  // 2) Horní propust 38 Hz — pod tím se hlasitost nevnímá.
  hornPropust(ven, vzorkovaci, 38, 0.5);
  return ven;
}

function police(x: Float32Array, fs: number, f0: number, dbZisk: number, q: number): void {
  const A = Math.pow(10, dbZisk / 40);
  const w = (2 * Math.PI * f0) / fs;
  const cs = Math.cos(w);
  const alfa = Math.sin(w) / (2 * q);
  const dva = 2 * Math.sqrt(A) * alfa;
  const b0 = A * ((A + 1) + (A - 1) * cs + dva);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cs);
  const b2 = A * ((A + 1) + (A - 1) * cs - dva);
  const a0 = (A + 1) - (A - 1) * cs + dva;
  const a1 = 2 * ((A - 1) - (A + 1) * cs);
  const a2 = (A + 1) - (A - 1) * cs - dva;
  biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function hornPropust(x: Float32Array, fs: number, f0: number, q: number): void {
  const w = (2 * Math.PI * f0) / fs;
  const cs = Math.cos(w);
  const alfa = Math.sin(w) / (2 * q);
  const b0 = (1 + cs) / 2;
  const b1 = -(1 + cs);
  const b2 = (1 + cs) / 2;
  const a0 = 1 + alfa;
  const a1 = -2 * cs;
  const a2 = 1 - alfa;
  biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): void {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const vstup = x[i];
    const y = b0 * vstup + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = vstup;
    y2 = y1; y1 = y;
    x[i] = y;
  }
}

/**
 * Profily tónin podle Krumhanslové a Schmucklera.
 *
 * Čísla říkají, jak často se který stupeň v dané tónině vyskytuje.
 * Porovnáním s chromatickým obrazem nahrávky vyjde, které tónině
 * odpovídá nejlíp.
 */
const PROFIL_DUR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PROFIL_MOLL = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const NAZVY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface Tonina {
  /** Například „A" nebo „F#". */
  tonika: string;
  dur: boolean;
  /** Jak jistě to sedí, 0–100. Nízké číslo znamená nejednoznačnou nahrávku. */
  jistota: number;
  /** Například „A moll". */
  popis: string;
}

/** Pearsonův korelační koeficient. */
function korelace(a: number[], b: number[]): number {
  const n = a.length;
  const sa = a.reduce((x, y) => x + y, 0) / n;
  const sb = b.reduce((x, y) => x + y, 0) / n;
  let cit = 0, ja = 0, jb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - sa;
    const db = b[i] - sb;
    cit += da * db; ja += da * da; jb += db * db;
  }
  const jm = Math.sqrt(ja * jb);
  return jm > 0 ? cit / jm : 0;
}

/**
 * Tónina z chromatického obrazu.
 *
 * Zkouší se všech dvanáct posunů v duru i v moll; vyhrává nejlepší
 * shoda. Jistota je odstup od druhé nejlepší — u nahrávky, která sedí
 * na dvě tóniny stejně, je nízká, a to je poctivější než tvrdit jednu.
 */
export function toninaZChroma(chroma: ArrayLike<number>): Tonina | null {
  if (chroma.length !== 12) return null;
  const v = Array.from(chroma, (x) => Number(x) || 0);
  if (v.every((x) => x === 0)) return null;

  const skore: { tonika: number; dur: boolean; hodnota: number }[] = [];
  for (let posun = 0; posun < 12; posun++) {
    const otoceno = v.map((_, i) => v[(i + posun) % 12]);
    skore.push({ tonika: posun, dur: true, hodnota: korelace(otoceno, PROFIL_DUR) });
    skore.push({ tonika: posun, dur: false, hodnota: korelace(otoceno, PROFIL_MOLL) });
  }
  skore.sort((a, b) => b.hodnota - a.hodnota);
  const nej = skore[0];
  const druhy = skore[1];

  // Odstup se roztahuje na procenta; shoda pod nulou nic neznamená.
  const jistota = Math.max(0, Math.min(100, Math.round((nej.hodnota - druhy.hodnota) * 300)));
  return {
    tonika: NAZVY[nej.tonika],
    dur: nej.dur,
    jistota,
    popis: `${NAZVY[nej.tonika]} ${nej.dur ? 'dur' : 'moll'}`,
  };
}

/**
 * Jak stabilní je tempo, 0–100.
 *
 * Počítá se z rozptylu mezer mezi údery: pravidelný klik dá sto,
 * rubato výrazně míň. Míň než dva údery nic neříká.
 */
export function stabilitaTempa(mezery: number[]): number {
  const platne = mezery.filter((m) => m > 0);
  if (platne.length < 2) return 0;
  const stred = platne.reduce((a, b) => a + b, 0) / platne.length;
  if (!(stred > 0)) return 0;
  const rozptyl = platne.reduce((a, m) => a + (m - stred) ** 2, 0) / platne.length;
  // Poměrná odchylka: 0 % kolísání = 100, 25 % a víc = 0.
  const kolisani = Math.sqrt(rozptyl) / stred;
  return Math.max(0, Math.min(100, Math.round(100 - kolisani * 400)));
}

/**
 * Zastoupení jednotlivých stop v mixu, v procentech.
 *
 * Bere se efektivní hodnota každé stopy proti té nejhlasitější — ne
 * proti součtu. Součet by u šesti stop dal každé sotva dvacet procent
 * i tam, kde je zřetelně slyšet.
 */
export function zastoupeniStop(hodnoty: Record<string, number>): Record<string, number> {
  const kliče = Object.keys(hodnoty);
  if (!kliče.length) return {};
  const nej = Math.max(...kliče.map((k) => hodnoty[k] || 0));
  const ven: Record<string, number> = {};
  for (const k of kliče) {
    ven[k] = nej > 0 ? Math.round(((hodnoty[k] || 0) / nej) * 100) : 0;
  }
  return ven;
}

export interface RozborStopy {
  spickaDb: number;
  rmsDb: number;
  lufs: number;
  dynamika: number;
  delka: number;
  tonina: Tonina | null;
}

/**
 * Celý rozbor jedné stopy.
 *
 * Tónina se počítá z chromatického obrazu přes celou nahrávku; u kratší
 * než dvě vteřiny se vynechá, protože z pár akordů vyjde náhoda.
 */
export function rozeberStopu(data: Float32Array, vzorkovaci: number): RozborStopy {
  const delka = vzorkovaci > 0 ? data.length / vzorkovaci : 0;
  const rozbor: RozborStopy = {
    spickaDb: naDb(spicka(data)),
    rmsDb: naDb(rms(data)),
    lufs: hlasitostLufs(data, vzorkovaci),
    dynamika: dynamickyRozsah(data),
    delka,
    tonina: null,
  };
  if (delka >= 2) {
    const snimky = snimkySpektra(data, VYCHOZI_SNIMKY);
    const soucet = new Float64Array(12);
    for (const s of snimky) {
      const ch = chromaZeSpektra(s, vzorkovaci, VYCHOZI_SNIMKY.okno);
      for (let i = 0; i < 12; i++) soucet[i] += ch[i];
    }
    rozbor.tonina = toninaZChroma(Array.from(soucet));
  }
  return rozbor;
}
