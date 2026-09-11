import { authorizedFetch } from '../assetLibraryService';
import { ImportChyba, jeKodChyby } from './chyby';
import type { NahledKolekce, NahledOdpoved } from './normalizace';

/**
 * Volání serveru pro import.
 *
 * Na Spotify se z prohlížeče nesahá: klíč aplikace je jen na serveru a
 * normalizace běží tam, kde se odpověď přijme. Prohlížeč dostane hotové
 * náhledy ve stejném tvaru, v jakém je ukazuje.
 *
 * Chyby ze serveru přicházejí jako `{ kod, zprava, technicky }` a vrací
 * se odsud jako `ImportChyba` — komponenta s nimi pracuje stejně jako
 * s chybami vzniklými v prohlížeči.
 */

async function volej<T>(cesta: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await authorizedFetch(cesta, init);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ImportChyba('CANCELLED', 'zrušeno v prohlížeči');
    throw new ImportChyba('SPOTIFY_API_ERROR', `síť: ${e?.message || e}`, 'Server aplikace neodpovídá.');
  }
  const data: any = await r.json().catch(() => null);
  if (!r.ok) {
    if (jeKodChyby(data?.kod)) throw new ImportChyba(data.kod, String(data.technicky || `HTTP ${r.status}`), data.zprava);
    if (r.status === 401) {
      throw new ImportChyba('SPOTIFY_API_ERROR', 'HTTP 401 z aplikace', 'Nejsi přihlášený do aplikace.');
    }
    throw new ImportChyba('SPOTIFY_API_ERROR', `HTTP ${r.status}`);
  }
  return data as T;
}

export const musicImportApi = {
  stav(): Promise<{ nastaveno: boolean }> {
    return volej('/api/music-import/stav');
  },

  /**
   * Náhled odkazu.
   *
   * Token uživatele jde v samostatné hlavičce — `Authorization` nese
   * přihlášení do aplikace a obojí se nesmí plést.
   */
  nahled(odkaz: string, spotifyToken?: string | null, signal?: AbortSignal): Promise<NahledOdpoved> {
    return volej('/api/music-import/nahled', {
      method: 'POST',
      body: JSON.stringify({ odkaz }),
      headers: spotifyToken ? { 'X-Spotify-Token': spotifyToken } : {},
      signal,
    });
  },

  async hledej(dotaz: string, signal?: AbortSignal): Promise<NahledKolekce> {
    const d = await volej<{ kolekce: NahledKolekce }>(
      `/api/music-import/hledat?q=${encodeURIComponent(dotaz)}`,
      { signal },
    );
    return d.kolekce;
  },
};
