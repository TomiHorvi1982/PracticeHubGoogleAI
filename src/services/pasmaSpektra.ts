/**
 * Rozdělení spektra do pásem, jak se kreslí na equalizéru.
 *
 * FFT dává rovnoměrné krokování po frekvenci, jenže sluch je
 * logaritmický: mezi 100 a 200 Hz je oktáva, mezi 10 000 a 10 100 Hz
 * skoro nic. Bez přepočtu by tři čtvrtiny sloupců připadly na výšky,
 * kde stejně nic není, a basy by se vešly do jednoho.
 *
 * Počítá se to zvlášť od kreslení, aby se to dalo ověřit bez plátna.
 */

/** Odkud kam se kreslí. Pod 30 Hz je brum, nad 16 kHz už kytara nemá co. */
export const OD_HZ = 30;
export const DO_HZ = 16000;

export interface Pasmo {
  /** Index prvního a posledního koše FFT, který do pásma spadá. */
  od: number;
  do: number;
  /** Střední frekvence pásma — na popisky. */
  stred: number;
}

/**
 * Rozseká koše FFT na `pocet` pásem rozložených logaritmicky.
 *
 * `vzorkovaci` je vzorkovací frekvence kontextu, `kosu` je
 * `analyser.frequencyBinCount`.
 */
export function pasma(pocet: number, kosu: number, vzorkovaci: number): Pasmo[] {
  if (pocet < 1 || kosu < 2 || !(vzorkovaci > 0)) return [];
  const naKos = (vzorkovaci / 2) / kosu;
  const ven: Pasmo[] = [];
  let predchoziKonec = -1;

  for (let i = 0; i < pocet; i++) {
    const f1 = OD_HZ * (DO_HZ / OD_HZ) ** (i / pocet);
    const f2 = OD_HZ * (DO_HZ / OD_HZ) ** ((i + 1) / pocet);
    let od = Math.floor(f1 / naKos);
    let doKdy = Math.ceil(f2 / naKos) - 1;

    // Dole je pásmo užší než jeden koš. Aby se dva sloupce nekreslily
    // ze stejných dat, posune se začátek za konec předchozího.
    od = Math.max(od, predchoziKonec + 1);
    doKdy = Math.max(od, Math.min(doKdy, kosu - 1));
    if (od > kosu - 1) break;

    predchoziKonec = doKdy;
    // Střed se počítá z košů, které pásmu opravdu připadly, ne ze
    // zamýšleného rozsahu. Dole se pásma posouvají, aby se nepřekrývala,
    // a popisek by pak ukazoval jinam, než co je pod ním nakreslené.
    ven.push({ od, do: doKdy, stred: (od + doKdy + 1) / 2 * naKos });
  }
  return ven;
}

/**
 * Výška sloupce 0–1 z hodnot analyzéru.
 *
 * Analyzér vrací decibely (typicky −100 až −30). Bere se z pásma
 * maximum, ne průměr: průměr by úzkou špičku rozmělnil do ztracena
 * a sloupec by se skoro nehnul.
 */
export function vyskaPasma(data: Uint8Array, p: Pasmo): number {
  let max = 0;
  for (let i = p.od; i <= p.do && i < data.length; i++) {
    if (data[i] > max) max = data[i];
  }
  return max / 255;
}

/**
 * Posun špičky dolů.
 *
 * Čepička nad sloupcem má stoupat okamžitě a klesat pomalu — jinak
 * není vidět, kam to vyskočilo. `ubytek` je díl za snímek.
 */
export function novaSpicka(stara: number, ted: number, ubytek = 0.012): number {
  return ted >= stara ? ted : Math.max(ted, stara - ubytek);
}

/** Popisek frekvence tak, jak se píše na osu. */
export function popisHz(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return String(Math.round(hz));
}
