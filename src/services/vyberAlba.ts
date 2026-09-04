/**
 * Dohledání alba ke skladbě.
 *
 * Deezer u každé nalezené skladby vrací i album, ze kterého pochází.
 * Stačí tedy vyhledat „interpret název" a z výsledků vybrat ten, který
 * opravdu odpovídá — a to je ta zajímavá část: na dotaz „Sepultura
 * Roots" vrátí i coververze, živáky a remastery jiných kapel.
 *
 * Rozhodovací část je oddělená od sítě, protože „vybrat správný
 * výsledek" je přesně to, co se dá splést tiše: špatná volba se
 * neprojeví chybou, jen ukáže cizí album.
 */

export interface NalezenaStopa {
  id: string;
  nazev: string;
  interpret: string;
  album: string;
  albumId: string;
  obal?: string;
}

/** Porovnává se bez diakritiky, závorek a velikosti písmen. */
export function normalizuj(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // „(Live)", „[Remastered 2019]", „- Radio Edit" jsou přívažky, ne
    // jiná skladba; bez jejich odstranění by se přesná shoda nenašla.
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Shoda dvou názvů: 2 přesná, 1 jeden obsahuje druhý, 0 nic. */
export function shoda(a: string, b: string): 0 | 1 | 2 {
  const x = normalizuj(a);
  const y = normalizuj(b);
  if (!x || !y) return 0;
  if (x === y) return 2;
  return x.includes(y) || y.includes(x) ? 1 : 0;
}

/**
 * Vybere z výsledků ten, který nejlíp sedí na hledanou skladbu.
 *
 * Interpret váží víc než název: špatný interpret znamená cizí album,
 * kdežto odchylka v názvu bývá jen jiné vydání téže skladby. Když se
 * interpret neshoduje ani částečně, výsledek se nebere vůbec — radši
 * album neukázat než ukázat cizí.
 */
export function vyberNejlepsi(
  vysledky: NalezenaStopa[],
  interpret: string,
  nazev: string,
): NalezenaStopa | null {
  let nej: { s: NalezenaStopa; body: number } | null = null;
  for (const v of vysledky) {
    if (!v.albumId) continue;
    const si = shoda(v.interpret, interpret);
    if (si === 0) continue;
    const body = si * 10 + shoda(v.nazev, nazev) * 3;
    if (!nej || body > nej.body) nej = { s: v, body };
  }
  return nej ? nej.s : null;
}

/**
 * Dotaz do vyhledávání.
 *
 * Interpret první: Deezer řadí podle popularity a bez něj vyhrává
 * nejznámější skladba toho jména bez ohledu na to, kdo ji hraje.
 */
export function dotazNaSkladbu(interpret: string, nazev: string): string {
  return [interpret, nazev].map((x) => (x || '').trim()).filter(Boolean).join(' ');
}
