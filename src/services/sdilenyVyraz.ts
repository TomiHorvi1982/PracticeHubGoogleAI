/**
 * Co se právě hledá, sdílené mezi sekcemi.
 *
 * Napíšeš název v jedné sekci nebo klikneš na skladbu a ostatní
 * vyhledávače o tom vědí: až tam přijdeš, mají pole vyplněné a výsledky
 * načtené, aniž bys to psal znovu.
 *
 * Hledá se ale až při vstupu do sekce, ne dopředu. Rozeslat dotaz na
 * Deezer, Last.fm, Ultimate Guitar a archiv pokaždé, co někde klikneš,
 * by znamenalo desítky dotazů na cizí služby za výsledky, které si
 * většinou nikdo neotevře.
 *
 * Drží se v `sessionStorage`, ne v `localStorage`: je to „na čem právě
 * dělám", ne nastavení. Po zavření okna nemá co přežít.
 */

const KLIC = 'neverlate.sdileny.vyraz';

type Poslucha = (vyraz: string) => void;

let vyraz = nactiZUlozeni();
const posluchaci = new Set<Poslucha>();

function nactiZUlozeni(): string {
  try {
    return sessionStorage.getItem(KLIC) || '';
  } catch {
    return '';
  }
}

/**
 * Má sekce hledat znovu?
 *
 * Ne, když je výraz prázdný nebo když tatáž sekce už tenhle výraz
 * hledala — přepínání sem a tam by jinak posílalo tentýž dotaz pořád
 * dokola.
 */
export function maHledatZnovu(vyraz: string, posledniHledany: string | null): boolean {
  const v = vyraz.trim();
  if (v.length < 2) return false;
  return v !== (posledniHledany || '').trim();
}

/**
 * Složí výraz ze skladby.
 *
 * Interpret první, stejně jako u dohledávání alba: bez něj vyhrává
 * nejznámější skladba toho jména bez ohledu na to, kdo ji hraje.
 */
export function vyrazZeSkladby(interpret?: string, nazev?: string): string {
  return [interpret, nazev].map((x) => (x || '').trim()).filter(Boolean).join(' ');
}

export const sdilenyVyraz = {
  ziskej(): string {
    return vyraz;
  },

  /**
   * Nastaví, co se hledá.
   *
   * Kratší než dva znaky se bere jako smazání — jedno písmeno není
   * dotaz a rozesílat ho po sekcích nemá smysl.
   */
  nastav(novy: string): void {
    const v = (novy || '').trim();
    if (v === vyraz) return;
    vyraz = v.length >= 2 ? v : '';
    try {
      if (vyraz) sessionStorage.setItem(KLIC, vyraz);
      else sessionStorage.removeItem(KLIC);
    } catch { /* bez zapamatování to funguje taky */ }
    posluchaci.forEach((f) => f(vyraz));
  },

  subscribe(f: Poslucha): () => void {
    posluchaci.add(f);
    return () => { posluchaci.delete(f); };
  },
};
