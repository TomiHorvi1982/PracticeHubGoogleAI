/**
 * Chyby importu hudby.
 *
 * Každá chyba má dvě podoby: větu pro člověka a technický záznam pro
 * ladění. Člověk potřebuje vědět, co udělat dál; kdo to ladí, potřebuje
 * vědět, co přesně vrátil server. Míchat to do jedné hlášky znamená, že
 * jedna z těch dvou skupin dostane nesmysl.
 *
 * Kódy jsou anglicky a stabilní — podle nich se rozhoduje v kódu a hledá
 * v logu. Hlášky jsou česky jako zbytek aplikace, s jedinou výjimkou: věta
 * o nedostupném zdroji zvuku zůstává přesně ve znění ze zadání.
 */

export type KodChyby =
  | 'INVALID_URL'
  | 'UNSUPPORTED_SOURCE'
  | 'SPOTIFY_NOT_CONFIGURED'
  | 'SPOTIFY_LOGIN_REQUIRED'
  | 'SPOTIFY_API_ERROR'
  | 'RATE_LIMITED'
  | 'TRACK_NOT_FOUND'
  | 'PLAYLIST_UNAVAILABLE'
  | 'METADATA_UNAVAILABLE'
  | 'ARTWORK_UNAVAILABLE'
  | 'AUDIO_SOURCE_UNAVAILABLE'
  | 'DOWNLOAD_FAILED'
  | 'STORAGE_FAILED'
  | 'DATABASE_FAILED'
  | 'DUPLICATE_TRACK'
  | 'CANCELLED';

export const ZPRAVY: Record<KodChyby, string> = {
  INVALID_URL: 'Tohle není platný odkaz na Spotify. Zkopíruj ho přes „Sdílet" → „Kopírovat odkaz".',
  UNSUPPORTED_SOURCE: 'Tenhle druh obsahu se importovat nedá — jen skladby, alba, playlisty a interpreti.',
  SPOTIFY_NOT_CONFIGURED: 'Import ze Spotify není nastavený. Na serveru chybí SPOTIFY_CLIENT_ID a SPOTIFY_CLIENT_SECRET.',
  SPOTIFY_LOGIN_REQUIRED: 'Skladby z playlistu Spotify vydá jen jeho majiteli nebo spoluautorovi. Přihlas se ke Spotify.',
  SPOTIFY_API_ERROR: 'Spotify teď neodpovídá, jak má. Zkus to za chvíli znovu.',
  RATE_LIMITED: 'Spotify nás na chvíli přibrzdilo kvůli počtu dotazů. Počkej pár vteřin a zkus to znovu.',
  TRACK_NOT_FOUND: 'Tahle skladba na Spotify není nebo byla odstraněna.',
  PLAYLIST_UNAVAILABLE: 'Playlist se nepodařilo načíst. Je soukromý, smazaný, nebo není tvůj.',
  METADATA_UNAVAILABLE: 'U téhle položky chybí údaje, bez kterých se skladba založit nedá.',
  ARTWORK_UNAVAILABLE: 'Obal se nepodařilo získat. Skladba se založí bez něj.',
  AUDIO_SOURCE_UNAVAILABLE: 'Audio source unavailable for authorized import.',
  DOWNLOAD_FAILED: 'Soubor se zvukem se nepodařilo převzít.',
  STORAGE_FAILED: 'Zvuk se nepodařilo uložit do knihovny.',
  DATABASE_FAILED: 'Skladbu se nepodařilo uložit do zpěvníku.',
  DUPLICATE_TRACK: 'Tahle skladba už ve zpěvníku je.',
  CANCELLED: 'Import byl zrušen.',
};

/**
 * Kde se dá zkusit znovu.
 *
 * Opakovat má smysl jen u chyb, které jsou dočasné nebo na naší straně.
 * Neplatný odkaz nebo chybějící oprávnění se opakováním nezmění — tlačítko
 * „zkusit znovu" by u nich jen slibovalo něco, co nepřijde.
 */
const OPAKOVATELNE: ReadonlySet<KodChyby> = new Set<KodChyby>([
  'SPOTIFY_API_ERROR', 'RATE_LIMITED', 'DOWNLOAD_FAILED', 'STORAGE_FAILED', 'DATABASE_FAILED',
  'ARTWORK_UNAVAILABLE', 'CANCELLED',
]);

export function lzeOpakovat(kod: KodChyby): boolean {
  return OPAKOVATELNE.has(kod);
}

export class ImportChyba extends Error {
  readonly kod: KodChyby;
  /** Co přesně se stalo — stav serveru, tělo odpovědi. Do logu, ne do okna. */
  readonly technicky: string;

  constructor(kod: KodChyby, technicky = '', zprava?: string) {
    super(zprava || ZPRAVY[kod]);
    this.name = 'ImportChyba';
    this.kod = kod;
    this.technicky = technicky;
  }
}

export interface PopisChyby {
  kod: KodChyby;
  zprava: string;
  technicky: string;
  opakovat: boolean;
}

/**
 * Převede cokoli, co přiletí z `catch`, na popis chyby.
 *
 * Neznámá chyba se nesmí ukázat jako „undefined" ani jako surový stack.
 * Zařadí se podle toho, v jakém kroku vznikla — o tom rozhoduje volající.
 */
export function popisChyby(e: unknown, vychozi: KodChyby = 'SPOTIFY_API_ERROR'): PopisChyby {
  if (e instanceof ImportChyba) {
    return { kod: e.kod, zprava: e.message, technicky: e.technicky, opakovat: lzeOpakovat(e.kod) };
  }
  // Zrušení přes AbortController přichází jako DOMException „AbortError".
  if (e && typeof e === 'object' && (e as any).name === 'AbortError') {
    return { kod: 'CANCELLED', zprava: ZPRAVY.CANCELLED, technicky: 'AbortError', opakovat: true };
  }
  const technicky = e instanceof Error ? `${e.name}: ${e.message}` : String(e ?? '');
  return { kod: vychozi, zprava: ZPRAVY[vychozi], technicky, opakovat: lzeOpakovat(vychozi) };
}

/** Je hodnota jedním z kódů? Server posílá kód jako řetězec. */
export function jeKodChyby(x: unknown): x is KodChyby {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(ZPRAVY, x);
}
