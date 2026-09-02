/**
 * Rychlá Fourierova transformace a snímky spektra.
 *
 * Web Audio umí spektrum jen v reálném čase přes AnalyserNode. Tady se
 * ale rozebírá hotová nahrávka a je potřeba ji projít snímek po snímku,
 * rychleji než by hrála — proto vlastní výpočet.
 *
 * Bez závislostí, ať jde ověřit samostatně: chyba ve Fourierovi se
 * projeví až jako nesmyslné hodnocení hry a nikdo ji tam nehledá.
 */

/**
 * Transformace na místě, základ dva.
 *
 * `re` a `im` se přepisují. Délka musí být mocninou dvou — jiné délky
 * by potřebovaly jiný algoritmus a tady se stejně vždycky volí okno
 * jako mocnina dvou.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Přerovnání podle obráceného pořadí bitů.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let delka = 2; delka <= n; delka <<= 1) {
    const uhel = (-2 * Math.PI) / delka;
    const wRe = Math.cos(uhel);
    const wIm = Math.sin(uhel);
    for (let i = 0; i < n; i += delka) {
      let curRe = 1;
      let curIm = 0;
      for (let j = 0; j < delka / 2; j += 1) {
        const aRe = re[i + j];
        const aIm = im[i + j];
        const bRe = re[i + j + delka / 2] * curRe - im[i + j + delka / 2] * curIm;
        const bIm = re[i + j + delka / 2] * curIm + im[i + j + delka / 2] * curRe;
        re[i + j] = aRe + bRe;
        im[i + j] = aIm + bIm;
        re[i + j + delka / 2] = aRe - bRe;
        im[i + j + delka / 2] = aIm - bIm;
        const dalsiRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = dalsiRe;
      }
    }
  }
}

/**
 * Hannovo okno.
 *
 * Bez okna má každý snímek na krajích ostrý zlom, který se ve spektru
 * projeví jako energie rozmazaná přes všechny frekvence — a chroma
 * z toho vyjde jako šum místo tónů.
 */
export function hannovoOkno(delka: number): Float32Array {
  const o = new Float32Array(delka);
  for (let i = 0; i < delka; i += 1) {
    o[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (delka - 1)));
  }
  return o;
}

/** Velikosti spektra jednoho snímku — jen užitečná polovina. */
export function magnitudy(vzorky: Float32Array, okno: Float32Array): Float32Array {
  const n = vzorky.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i += 1) re[i] = vzorky[i] * okno[i];

  fft(re, im);

  const ven = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i += 1) {
    ven[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return ven;
}

export interface SnimkyNastaveni {
  /** Vzorků na snímek. Mocnina dvou. */
  okno: number;
  /** O kolik vzorků se posouvá další snímek. */
  krok: number;
}

export const VYCHOZI_SNIMKY: SnimkyNastaveni = { okno: 4096, krok: 2048 };

/**
 * Rozebere signál na snímky spektra.
 *
 * Okno 4096 vzorků je při 44,1 kHz asi 93 ms — dost dlouhé, aby se
 * rozlišily basové struny, a dost krátké, aby se v jednom snímku
 * nemíchaly dva tóny rychlejšího riffu. Krok o polovinu okna dává
 * překryv, bez kterého by tóny na hranicích snímků mizely.
 */
export function snimkySpektra(
  kanal: Float32Array,
  n: SnimkyNastaveni = VYCHOZI_SNIMKY,
): Float32Array[] {
  const ven: Float32Array[] = [];
  if (kanal.length < n.okno) return ven;
  const okno = hannovoOkno(n.okno);
  for (let od = 0; od + n.okno <= kanal.length; od += n.krok) {
    ven.push(magnitudy(kanal.subarray(od, od + n.okno), okno));
  }
  return ven;
}

/** Kolik vteřin dělí dva snímky — podle toho se počítají odchylky času. */
export function snimekVterin(vzorkovaci: number, n: SnimkyNastaveni = VYCHOZI_SNIMKY): number {
  return n.krok / vzorkovaci;
}
