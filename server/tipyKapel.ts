/**
 * Tipy na kapely a interprety podle dekády.
 *
 * Osm set jmen se ručně psát nedá, tak se berou z MusicBrainzu: umí
 * filtrovat podle země i podle roku vzniku, což je přesně ta dvojice,
 * kterou potřebujeme.
 *
 * Skládání dotazu je tady zvlášť, protože je to jediné, co se dá splést
 * tiše — špatná závorka nevrátí chybu, jen jiné kapely.
 */

export type Oblast = 'cesko' | 'svet';

/** Dekády, ze kterých se dá vybírat. */
export const DEKADY = [1990, 2000, 2010, 2020];

/**
 * Dotaz pro MusicBrainz.
 *
 * Česko se schválně nefiltruje podle žánru: české kapely tam mají
 * žánrové štítky vyplněné zřídka, takže by filtr vyhodil i Škwor nebo
 * Vypsanou fiXu — naměřeno 442 kapel bez filtru proti 68 s ním.
 * U světa je to naopak: bez žánru by to byl celý hudební svět, tak se
 * drží u toho, co se v kapele hraje.
 */
export function postavDotaz(oblast: Oblast, dekada: number): string {
  const roky = `begin:[${dekada} TO ${dekada + 9}]`;
  return oblast === 'cesko'
    ? `country:CZ AND ${roky}`
    : `(tag:metal OR tag:rock OR tag:punk) AND ${roky}`;
}

export interface Tip {
  jmeno: string;
  zeme: string;
  /** Odkud se vzal — pro ladění, ne pro zobrazení. */
  zacatek: string;
  popis: string;
}

/**
 * Vytáhne z odpovědi jen to, co se ukazuje.
 *
 * Vyhazují se položky bez jména a duplicity: MusicBrainz vede některé
 * kapely víckrát (přejmenování, různá obsazení) a v pruhu tipů by se
 * pak stejné jméno objevilo dvakrát vedle sebe.
 */
export function zpracujOdpoved(data: any): { tipy: Tip[]; celkem: number } {
  const seznam: any[] = Array.isArray(data?.artists) ? data.artists : [];
  const videna = new Set<string>();
  const tipy: Tip[] = [];
  for (const a of seznam) {
    const jmeno = String(a?.name || '').trim();
    if (!jmeno) continue;
    const klic = jmeno.toLowerCase();
    if (videna.has(klic)) continue;
    videna.add(klic);
    tipy.push({
      jmeno,
      zeme: String(a?.country || ''),
      zacatek: String(a?.['life-span']?.begin || ''),
      popis: String(a?.disambiguation || ''),
    });
  }
  return { tipy, celkem: Number(data?.count) || tipy.length };
}

/** Je to dekáda, kterou nabízíme? Chodí to z adresy, tak se to ověřuje. */
export function platnaDekada(v: unknown): number | null {
  const n = Number(v);
  return DEKADY.includes(n) ? n : null;
}
