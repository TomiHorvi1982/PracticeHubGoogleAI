import type { Song } from '../../types';
import { klicPisne } from '../klicPisne';

/**
 * Je skladba ve zpěvníku už?
 *
 * Kontroluje se od nejjistějšího k nejvolnějšímu:
 *
 *   1. id na Spotify — tatáž položka importovaná podruhé
 *   2. ISRC — tatáž nahrávka, i když přišla z jiného alba (singl a album)
 *   3. otisk zvuku — tentýž soubor připojený k jiné písni
 *   4. interpret + název — píseň, která ve zpěvníku byla dřív než import
 *
 * Čtvrtý bod je nejdůležitější a nejzrádnější zároveň. Zpěvník má písně
 * přepsané z textů a akordů, bez jakékoli vazby na Spotify — a právě ty
 * se nesmí zdvojit. Jenže Spotify k názvu lepí „- Remastered 2011" a
 * „(Live)", takže bez očištění by se tatáž píseň nepoznala.
 */

export type DruhShody = 'sourceId' | 'isrc' | 'checksum' | 'nazev';

export interface Shoda {
  druh: DruhShody;
  song: Song;
}

export interface Kandidat {
  sourceId: string;
  isrc: string | null;
  title: string;
  artist: string;
  audioChecksum?: string;
}

/**
 * Doplňky, které Spotify přidává k názvu a které píseň nemění.
 *
 * Záměrně jen „remaster" a podobné — ne „live", „acoustic" nebo „remix".
 * Živá verze je jiná nahrávka a ke zkoušení se hodí zvlášť; spojit ji se
 * studiovou by znamenalo, že se jedna z nich neimportuje.
 */
const DOPLNKY = [
  /\s*[-–—]\s*(\d{4}\s+)?(digital(ly)?\s+)?remaster(ed)?(\s+(version|\d{4}))?\s*$/i,
  /\s*[([](\d{4}\s+)?(digital(ly)?\s+)?remaster(ed)?(\s+(version|\d{4}))?[)\]]\s*$/i,
  /\s*[-–—]\s*(\d{4}\s+)?mono(\s+version)?\s*$/i,
  /\s*[-–—]\s*(radio\s+edit|single\s+version|album\s+version)\s*$/i,
  /\s*[([](radio\s+edit|single\s+version|album\s+version)[)\]]\s*$/i,
];

/** Název bez doplňků, které tutéž píseň dělají „jinou". */
export function cistyNazev(nazev: string): string {
  let t = String(nazev || '').trim();
  // Doplňky se někdy vrství („… - Remastered 2011 - Mono"), proto dokola.
  for (let i = 0; i < 3; i++) {
    const pred = t;
    for (const vzor of DOPLNKY) t = t.replace(vzor, '');
    if (t === pred) break;
  }
  return t.trim() || String(nazev || '').trim();
}

export function najdiDuplicitu(k: Kandidat, songs: readonly Song[]): Shoda | null {
  const podle = (test: (s: Song) => boolean, druh: DruhShody): Shoda | null => {
    const song = songs.find(test);
    return song ? { druh, song } : null;
  };

  const zId = podle((s) => s.importMetadata?.sourceId === k.sourceId, 'sourceId');
  if (zId) return zId;

  if (k.isrc) {
    const zIsrc = podle((s) => !!s.importMetadata?.isrc && s.importMetadata.isrc === k.isrc, 'isrc');
    if (zIsrc) return zIsrc;
  }

  if (k.audioChecksum) {
    const zOtisku = podle((s) => s.importMetadata?.audioChecksum === k.audioChecksum, 'checksum');
    if (zOtisku) return zOtisku;
  }

  const klic = klicPisne(k.artist, cistyNazev(k.title));
  // Prázdný klíč by se shodl s každou písní bez názvu.
  if (klic === '|') return null;
  return podle((s) => klicPisne(s.artist, cistyNazev(s.title)) === klic, 'nazev');
}

export const POPIS_SHODY: Record<DruhShody, string> = {
  sourceId: 'už importovaná ze Spotify',
  isrc: 'tatáž nahrávka (ISRC)',
  checksum: 'tentýž zvukový soubor',
  nazev: 'stejný interpret a název',
};
