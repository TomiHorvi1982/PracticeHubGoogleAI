/**
 * Rozvržení pultu — co si uživatel nastaví okem, ne uchem.
 *
 * Výška stop patří k člověku, ne ke skladbě: kdo má velký monitor, chce
 * vlnovky vyšší u všeho, co otevře. Proto se to drží v prohlížeči a ne
 * u písně v databázi.
 */

/** Pod tohle už se do pruhu nevejde jméno stopy ani jezdec hlasitosti. */
export const MIN_VYSKA_STOPY = 48;
/** Nad tohle by se na obraz vešly sotva dvě stopy. */
export const MAX_VYSKA_STOPY = 240;
export const VYCHOZI_VYSKA_STOPY = 72;

const KLIC = 'pult_vyska_stopy';

export function srovnejVysku(v: number): number {
  if (!Number.isFinite(v)) return VYCHOZI_VYSKA_STOPY;
  return Math.round(Math.max(MIN_VYSKA_STOPY, Math.min(MAX_VYSKA_STOPY, v)));
}

export function nactiVysku(): number {
  try {
    const s = localStorage.getItem(KLIC);
    return s === null ? VYCHOZI_VYSKA_STOPY : srovnejVysku(Number(s));
  } catch {
    // Soukromé okno umí čtení zakázat; výchozí výška je pořád použitelná.
    return VYCHOZI_VYSKA_STOPY;
  }
}

export function ulozVysku(v: number): void {
  try { localStorage.setItem(KLIC, String(srovnejVysku(v))); } catch { /* nevadí */ }
}
