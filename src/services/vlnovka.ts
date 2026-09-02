/**
 * Výpočty pro vodorovné stopy s vlnovkou.
 *
 * Kreslení samo je pár řádků do canvasu; splést se dá to, co je tady —
 * převod vzorků na sloupce, umístění popisků času a přepočet mezi
 * pixelem a vteřinou. Proto je to zvlášť od komponenty.
 */

/**
 * Obálka stopy: pro každý sloupec pixelů jedna špička.
 *
 * Bere se největší výchylka v úseku, ne průměr. Průměr by z bicích
 * udělal rovný pás — rána trvá pár vzorků a mezi nimi je ticho, takže
 * by se ve stovce tisíc vzorků na sloupec ztratila.
 */
export function spocitejVrcholy(data: Float32Array, sloupcu: number): Float32Array {
  const ven = new Float32Array(Math.max(0, sloupcu));
  if (sloupcu <= 0 || data.length === 0) return ven;
  const naSloupec = data.length / sloupcu;
  for (let i = 0; i < sloupcu; i++) {
    const od = Math.floor(i * naSloupec);
    // Vždycky aspoň jeden vzorek: u krátkého souboru na širokém pultu
    // vyjde úsek kratší než vzorek a sloupec by zůstal nulový.
    const do_ = Math.max(od + 1, Math.min(data.length, Math.floor((i + 1) * naSloupec)));
    let max = 0;
    for (let j = od; j < do_; j++) {
      const v = data[j] < 0 ? -data[j] : data[j];
      if (v > max) max = v;
    }
    ven[i] = max;
  }
  return ven;
}

/** Kde na šířce leží daná vteřina. Mimo rozsah se ořezává, ne extrapoluje. */
export function casNaX(cas: number, delka: number, sirka: number): number {
  if (!(delka > 0) || !(sirka > 0)) return 0;
  return Math.max(0, Math.min(sirka, (cas / delka) * sirka));
}

/** Na kterou vteřinu se kliklo. */
export function xNaCas(x: number, delka: number, sirka: number): number {
  if (!(delka > 0) || !(sirka > 0)) return 0;
  return Math.max(0, Math.min(delka, (x / sirka) * delka));
}

/** Kroky, po kterých se popisuje časová osa. */
const KROKY = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/**
 * Popisky časové osy.
 *
 * Krok se volí podle šířky, ne napevno: na úzkém pultu by se popisky
 * po deseti vteřinách slily do jedné šmouhy, na širokém by naopak byly
 * tři na celou skladbu. `minOdstup` je nejmenší mezera v pixelech,
 * kterou po sobě ještě chceme.
 */
export function popiskyOsy(
  delka: number,
  sirka: number,
  minOdstup = 70,
): { cas: number; x: number }[] {
  if (!(delka > 0) || !(sirka > 0)) return [];
  const krok = KROKY.find((k) => (k / delka) * sirka >= minOdstup)
    // Delší než deset minut: dopočítá se násobek, ať se osa nezaplní.
    ?? Math.ceil(delka / Math.max(1, Math.floor(sirka / minOdstup)));
  const ven: { cas: number; x: number }[] = [];
  for (let t = 0; t <= delka + 0.001; t += krok) {
    ven.push({ cas: t, x: casNaX(t, delka, sirka) });
  }
  return ven;
}

/** Čas jako m:ss. */
export function cas(v: number): string {
  if (!Number.isFinite(v) || v < 0) return '0:00';
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
}
