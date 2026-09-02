/**
 * Porovnání vlastní hry s předlohou.
 *
 * Otázka „hraju to správně?" se rozpadá na tři, které se měří každá
 * jinak: hraju správné tóny, hraju je ve správný čas, a hraju je se
 * správnou dynamikou. Tenhle modul dělá to první a druhé; třetí je
 * navrch.
 *
 * Zásadní je, s čím se porovnává. Proti celému mixu to nemá smysl —
 * bicí a zpěv přebijí kytaru ve spektru i v úderech a měřila by se
 * shoda s bubeníkem. Předlohou má být oddělená kytarová stopa.
 *
 * Bez závislostí na prohlížeči, ať jde celý výpočet ověřit samostatně.
 */

import { snimkySpektra, snimekVterin, VYCHOZI_SNIMKY, SnimkyNastaveni } from './spektrum';

/** Kolik tónových tříd — dvanáct půltónů oktávy. */
export const TRID = 12;

/**
 * Chroma z výkonového spektra.
 *
 * Každý košík se podle své frekvence přiřadí tónové třídě a energie se
 * sečtou. Oktávy se tím slijí, což je tady výhoda: stejný riff o oktávu
 * jinde je pořád tentýž riff, a kytarista ho tak i hraje, jednou na
 * prázdných strunách a jindy s kapodastrem.
 */
export function chromaZeSpektra(
  magnitudy: ArrayLike<number>,
  vzorkovaciFrekvence: number,
  nejnizsi = 70,
  nejvyssi = 2000,
): Float32Array {
  const chroma = new Float32Array(TRID);
  const kosiku = magnitudy.length;
  if (!kosiku) return chroma;

  const naKosik = vzorkovaciFrekvence / 2 / kosiku;
  for (let i = 1; i < kosiku; i += 1) {
    const f = i * naKosik;
    // Mimo pásmo kytary je jen brum a šum činelů — jen by to rozmazalo.
    if (f < nejnizsi || f > nejvyssi) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    const trida = ((Math.round(midi) % TRID) + TRID) % TRID;
    chroma[trida] += magnitudy[i];
  }

  // Normalizace na jednotkovou délku: porovnává se tvar, ne hlasitost.
  let soucet = 0;
  for (const v of chroma) soucet += v * v;
  const delka = Math.sqrt(soucet);
  if (delka > 0) for (let i = 0; i < TRID; i += 1) chroma[i] /= delka;
  return chroma;
}

/** Vzdálenost dvou chroma vektorů: 0 shodné, 1 nic společného. */
export function vzdalenostChroma(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let skalarni = 0;
  for (let i = 0; i < TRID; i += 1) skalarni += a[i] * b[i];
  // Oba jsou jednotkové, takže skalární součin je kosinus úhlu.
  return 1 - Math.max(0, Math.min(1, skalarni));
}

export interface Zarovnani {
  /** Dvojice indexů: který snímek tvé hry odpovídá kterému v předloze. */
  cesta: [number, number][];
  /** Průměrná cena zarovnání. Vyšší znamená menší podobnost. */
  cena: number;
}

/**
 * Dynamické borcení času.
 *
 * Nehraješ přesně v tempu předlohy a nezačínáš ve stejnou chvíli, takže
 * porovnávat snímek po snímku nedává smysl — dvě stejné hry posunuté
 * o desetinu vteřiny by vyšly jako úplně jiné. Borcení najde, který
 * snímek tvé hry odpovídá kterému v předloze, i když se tempo v průběhu
 * mění.
 *
 * `pasmo` omezuje, jak daleko od úhlopříčky smí cesta uhnout. Kromě
 * zrychlení to hlavně brání nesmyslům: bez něj umí borcení „vysvětlit"
 * úplně jinou hru tím, že jeden tón roztáhne přes půl předlohy.
 */
/**
 * Pokuta za uhnutí z úhlopříčky.
 *
 * Bez ní je borcení u podobných nahrávek bezradné: když je cena všude
 * skoro nulová, žádná cesta není lepší než jiná a algoritmus bloudí do
 * stran. Naměřeno na dvou **totožných** signálech — cesta měla dvanáct
 * kroků místo devíti a vyšlo z toho „hraješ o 100 ms vedle" u hry, která
 * byla přesná na vzorek.
 *
 * Pokuta říká, co po borcení vlastně chceme: drž tempo, dokud tě
 * zvuk nepřinutí uhnout.
 */
export const POKUTA_ZA_UHNUTI = 0.08;

export function zarovnej(
  moje: Float32Array[],
  predloha: Float32Array[],
  pasmo = 0.25,
  pokuta = POKUTA_ZA_UHNUTI,
): Zarovnani {
  const n = moje.length;
  const m = predloha.length;
  if (!n || !m) return { cesta: [], cena: 1 };

  const sirka = Math.max(8, Math.round(Math.max(n, m) * pasmo));
  const NEKONECNO = Number.POSITIVE_INFINITY;

  // Matice nákladů. Řádky jsou moje snímky, sloupce předloha.
  const D: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(NEKONECNO));
  D[0][0] = 0;

  for (let i = 1; i <= n; i += 1) {
    const stred = Math.round((i * m) / n);
    const od = Math.max(1, stred - sirka);
    const doo = Math.min(m, stred + sirka);
    for (let j = od; j <= doo; j += 1) {
      const cena = vzdalenostChroma(moje[i - 1], predloha[j - 1]);
      const nejlepsi = Math.min(
        D[i - 1][j - 1],
        D[i - 1][j] + pokuta,
        D[i][j - 1] + pokuta,
      );
      D[i][j] = cena + nejlepsi;
    }
  }

  if (!Number.isFinite(D[n][m])) return { cesta: [], cena: 1 };

  // Zpětné dohledání cesty.
  const cesta: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    cesta.push([i - 1, j - 1]);
    // Stejná pokuta jako při počítání, jinak by zpětná cesta šla jinudy
    // než ta, kterou matice popisuje.
    const sikmo = D[i - 1][j - 1];
    const nahoru = D[i - 1][j] + pokuta;
    const doleva = D[i][j - 1] + pokuta;
    if (sikmo <= nahoru && sikmo <= doleva) { i -= 1; j -= 1; }
    else if (nahoru <= doleva) { i -= 1; }
    else { j -= 1; }
  }
  cesta.reverse();

  return { cesta, cena: D[n][m] / cesta.length };
}

export interface Odchylka {
  /** Čas v mé hře, ve vteřinách. */
  cas: number;
  /** O kolik jsem vedle. Kladné = opožďuju se, záporné = předbíhám. */
  posunMs: number;
}

/**
 * Odchylky časování z cesty zarovnání.
 *
 * Cesta říká, který můj snímek patří ke kterému v předloze. Rozdíl mezi
 * nimi je posun — a protože celý záznam bývá posunutý o start nahrávky,
 * odečítá se od něj střední hodnota. Zajímá nás, kde se rozcházíš uvnitř
 * úseku, ne že jsi zmáčkl nahrávání o půl vteřiny dřív.
 */
export function odchylkyZarovnani(
  z: Zarovnani,
  snimekVterin: number,
): { odchylky: Odchylka[]; stredniPosunMs: number } {
  if (!z.cesta.length) return { odchylky: [], stredniPosunMs: 0 };

  const surove = z.cesta.map(([i, j]) => (i - j) * snimekVterin * 1000);
  const stred = surove.reduce((a, b) => a + b, 0) / surove.length;

  return {
    stredniPosunMs: stred,
    odchylky: z.cesta.map(([i], k) => ({
      cas: i * snimekVterin,
      posunMs: surove[k] - stred,
    })),
  };
}

export interface Hodnoceni {
  /** Shoda tónů, 0 až 1. */
  tony: number;
  /** Typická odchylka časování v milisekundách. */
  rozptylMs: number;
  /** Nejhorší místo — kde se to nejvíc rozešlo. */
  nejhorsiCas: number;
  nejhorsiMs: number;
  /** O kolik jsi jako celek napřed nebo pozadu. */
  stredniPosunMs: number;
}

/**
 * Shrne porovnání do čísel, která něco říkají.
 *
 * Rozptyl, ne průměrná odchylka: průměr se u stejně velkých odchylek na
 * obě strany vyruší k nule a vypadalo by to, že hraješ přesně, i když
 * skáčeš kolem doby sem a tam.
 */
export function ohodnot(z: Zarovnani, snimekVterin: number): Hodnoceni {
  const { odchylky, stredniPosunMs } = odchylkyZarovnani(z, snimekVterin);
  if (!odchylky.length) {
    return { tony: 0, rozptylMs: 0, nejhorsiCas: 0, nejhorsiMs: 0, stredniPosunMs: 0 };
  }

  const ctverce = odchylky.reduce((a, o) => a + o.posunMs * o.posunMs, 0) / odchylky.length;
  let nejhorsi = odchylky[0];
  for (const o of odchylky) {
    if (Math.abs(o.posunMs) > Math.abs(nejhorsi.posunMs)) nejhorsi = o;
  }

  return {
    tony: Math.max(0, Math.min(1, 1 - z.cena)),
    rozptylMs: Math.sqrt(ctverce),
    nejhorsiCas: nejhorsi.cas,
    nejhorsiMs: nejhorsi.posunMs,
    stredniPosunMs,
  };
}

/**
 * Porovná dvě nahrávky od začátku do konce.
 *
 * Bere se holý signál a vzorkovací frekvence, ne `AudioBuffer` — díky
 * tomu jde celé porovnání spustit i mimo prohlížeč a ověřit.
 *
 * Předlohou má být **oddělená kytarová stopa**, ne celý mix. Proti mixu
 * by se měřila hlavně shoda s bicími, které mají v úderech i ve spektru
 * navrch.
 */
export function porovnejNahravky(
  moje: Float32Array,
  predloha: Float32Array,
  vzorkovaci: number,
  nastaveni: SnimkyNastaveni = VYCHOZI_SNIMKY,
): Hodnoceni & { snimku: number } {
  const chromaZ = (signal: Float32Array) =>
    snimkySpektra(signal, nastaveni).map((m) => chromaZeSpektra(m, vzorkovaci));

  const a = chromaZ(moje);
  const b = chromaZ(predloha);
  const z = zarovnej(a, b);
  return { ...ohodnot(z, snimekVterin(vzorkovaci, nastaveni)), snimku: a.length };
}
