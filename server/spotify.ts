import { ImportChyba } from '../src/services/musicImport/chyby';
import {
  NahledInterpreta, NahledKolekce, NahledOdpoved, interpretSAlby, kolekceZAlba, kolekceZHledani,
  kolekceZPlaylistu, kolekceZeSkladby,
} from '../src/services/musicImport/normalizace';

export type { NahledOdpoved };
import { rozeberOdkaz } from '../src/services/musicImport/spotifyOdkaz';

/**
 * Metadata ze Spotify (SpotifyMetadataProvider).
 *
 * Běží výhradně na serveru: klíč aplikace (`SPOTIFY_CLIENT_SECRET`) se do
 * prohlížeče dostat nesmí. Proto se proměnná nejmenuje `VITE_*` — to by ji
 * Vite zapekl do balíčku, který si stáhne každý návštěvník.
 *
 * Po vzoru `SpotifyClient` ze spotDL: token aplikace přes Client
 * Credentials, mezipaměť odpovědí, opakování při výpadku a přetížení.
 * spotDL k tomu používá knihovnu `spotipy`; tady stačí `fetch`, protože
 * se volá jen pár endpointů.
 *
 * Stav Spotify API, podle kterého je to psané (oficiální changelog):
 *
 *   - listopad 2024: novým aplikacím zmizel `preview_url` a editoriální
 *     playlisty Spotify,
 *   - únor 2026: `/playlists/{id}/tracks` → `/playlists/{id}/items`,
 *     hromadné `GET /tracks` a `GET /albums` odebrané, hledání nejvýš
 *     deset výsledků, pryč `popularity` a `label`, a hlavně: **skladby
 *     playlistu vydá jen jeho majiteli nebo spoluautorovi**,
 *   - březen 2026: `external_ids` (ISRC) zase vráceno.
 *
 * Cizí playlist tedy klíč aplikace přečte jen po název a obal. Na obsah
 * vlastního playlistu je potřeba token uživatele — ten přichází z
 * prohlížeče a nikam se neukládá.
 */

export const API = 'https://api.spotify.com/v1';
export const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export interface KonfigSpotify {
  clientId: string;
  clientSecret: string;
}

export function konfigZProstredi(env: NodeJS.ProcessEnv = process.env): KonfigSpotify | null {
  const clientId = (env.SPOTIFY_CLIENT_ID || '').trim();
  const clientSecret = (env.SPOTIFY_CLIENT_SECRET || '').trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface MoznostiKlienta {
  fetch?: FetchFn;
  ted?: () => number;
  spanek?: (ms: number) => Promise<void>;
  /** Strop položek jedné kolekce. Playlist s deseti tisíci skladbami nikdo ručně nevybírá. */
  maxPolozek?: number;
}

type Kontext = 'skladba' | 'album' | 'playlist' | 'polozky' | 'interpret' | 'hledani';

interface MoznostiDotazu {
  uzivatel?: string;
  signal?: AbortSignal;
  kontext: Kontext;
}

const MAX_POLOZEK = 1000;
const MAX_ALB_INTERPRETA = 100;
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 300;

/** Kus těla odpovědi do technického záznamu. Nikdy ne celé, nikdy ne hlavičky. */
async function kratkeTelo(r: Response): Promise<string> {
  try {
    return (await r.text()).replace(/\s+/g, ' ').slice(0, 300);
  } catch {
    return '';
  }
}

const NENALEZENO: Partial<Record<Kontext, string>> = {
  album: 'Tohle album na Spotify není.',
  interpret: 'Tohoto interpreta Spotify nezná.',
};

export class SpotifyKlient {
  private tokenApp: { hodnota: string; platiDo: number } | null = null;
  private ziskavani: Promise<string> | null = null;
  private cache = new Map<string, { data: unknown; platiDo: number }>();

  constructor(
    private readonly konfig: KonfigSpotify,
    private readonly moz: MoznostiKlienta = {},
  ) {}

  private f(url: string, init?: RequestInit): Promise<Response> {
    return (this.moz.fetch ?? ((u, i) => fetch(u, i)))(url, init);
  }

  private ted(): number {
    return (this.moz.ted ?? Date.now)();
  }

  private spi(ms: number): Promise<void> {
    return (this.moz.spanek ?? ((m) => new Promise((r) => setTimeout(r, m))))(ms);
  }

  /**
   * Token aplikace.
   *
   * Drží se, dokud platí (s minutovou rezervou), a souběžné dotazy si ho
   * nevyžádají každý zvlášť — na začátku importu alba by jinak odešlo pět
   * žádostí o token naráz.
   */
  async tokenAplikace(): Promise<string> {
    if (this.tokenApp && this.tokenApp.platiDo - 60_000 > this.ted()) return this.tokenApp.hodnota;
    if (this.ziskavani) return this.ziskavani;

    this.ziskavani = (async () => {
      try {
        const zakodovano = Buffer.from(`${this.konfig.clientId}:${this.konfig.clientSecret}`).toString('base64');
        const r = await this.f(TOKEN_URL, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${zakodovano}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        if (!r.ok) {
          const telo = await kratkeTelo(r);
          if (r.status === 400 || r.status === 401) {
            throw new ImportChyba(
              'SPOTIFY_NOT_CONFIGURED',
              `token: HTTP ${r.status} ${telo}`,
              'Spotify odmítlo klíče aplikace. Zkontroluj SPOTIFY_CLIENT_ID a SPOTIFY_CLIENT_SECRET.',
            );
          }
          throw new ImportChyba('SPOTIFY_API_ERROR', `token: HTTP ${r.status} ${telo}`);
        }
        const d: any = await r.json();
        if (!d?.access_token) throw new ImportChyba('SPOTIFY_API_ERROR', 'token: odpověď bez access_token');
        this.tokenApp = { hodnota: d.access_token, platiDo: this.ted() + (Number(d.expires_in) || 3600) * 1000 };
        return this.tokenApp.hodnota;
      } finally {
        this.ziskavani = null;
      }
    })();
    return this.ziskavani;
  }

  private ulozDoCache(klic: string, data: unknown): void {
    // Nejstarší ven — Map drží pořadí vložení.
    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(klic, { data, platiDo: this.ted() + CACHE_MS });
  }

  private chybaZeStavu(stav: number, telo: string, moz: MoznostiDotazu): ImportChyba {
    const technicky = `${moz.kontext}: HTTP ${stav} ${telo}`;
    if (stav === 401 && moz.uzivatel) {
      return new ImportChyba('SPOTIFY_LOGIN_REQUIRED', technicky, 'Přihlášení ke Spotify vypršelo. Přihlas se znovu.');
    }
    if (stav === 404) {
      return moz.kontext === 'playlist' || moz.kontext === 'polozky'
        ? new ImportChyba('PLAYLIST_UNAVAILABLE', technicky)
        : new ImportChyba('TRACK_NOT_FOUND', technicky, NENALEZENO[moz.kontext]);
    }
    if (stav === 403) {
      if (moz.kontext === 'polozky') {
        return new ImportChyba(
          'PLAYLIST_UNAVAILABLE',
          technicky,
          'Spotify vydá skladby playlistu jen jeho majiteli nebo spoluautorovi. Tenhle playlist tvůj není.',
        );
      }
      return new ImportChyba(
        'SPOTIFY_API_ERROR',
        technicky,
        'Spotify dotaz odmítlo. Ve vývojovém režimu musí mít vlastník aplikace aktivní Premium a uživatel musí být mezi povolenými.',
      );
    }
    if (stav === 400) return new ImportChyba('INVALID_URL', technicky, 'Spotify tenhle identifikátor nezná.');
    return new ImportChyba('SPOTIFY_API_ERROR', technicky);
  }

  /**
   * Jeden dotaz na Web API.
   *
   * Adresa musí vést na `api.spotify.com/v1`. Kontroluje se i u odkazu
   * `next` ze stránkování — ten přichází v odpovědi, a kdyby se mu věřilo
   * bez kontroly, server by šel, kam mu cizí odpověď řekne.
   *
   * Odpovědi s tokenem uživatele se nekešují: patří jemu, ne aplikaci.
   */
  async get(cesta: string, moz: MoznostiDotazu): Promise<any> {
    const url = cesta.startsWith('https://') ? cesta : `${API}${cesta}`;
    if (!url.startsWith(`${API}/`)) throw new ImportChyba('SPOTIFY_API_ERROR', `odmítnutá adresa: ${url.slice(0, 80)}`);

    const klic = moz.uzivatel ? null : url;
    if (klic) {
      const c = this.cache.get(klic);
      if (c && c.platiDo > this.ted()) return c.data;
    }

    let pokusy = 0;
    let obnovenToken = false;
    for (;;) {
      if (moz.signal?.aborted) throw new ImportChyba('CANCELLED', 'zrušeno');
      const token = moz.uzivatel ?? (await this.tokenAplikace());

      let r: Response;
      try {
        r = await this.f(url, { headers: { Authorization: `Bearer ${token}` }, signal: moz.signal });
      } catch (e: any) {
        if (e?.name === 'AbortError') throw new ImportChyba('CANCELLED', 'zrušeno');
        if (pokusy++ < 2) {
          await this.spi(500 * pokusy);
          continue;
        }
        throw new ImportChyba('SPOTIFY_API_ERROR', `${moz.kontext}: síť — ${e?.message || e}`);
      }

      if (r.ok) {
        const data = await r.json();
        if (klic) this.ulozDoCache(klic, data);
        return data;
      }
      if (r.status === 429) {
        // Retry-After ve vteřinách; strop, aby jeden dotaz nevisel minuty.
        const vterin = Math.min(10, Math.max(1, Number(r.headers.get('retry-after')) || 1));
        if (pokusy++ < 2) {
          await this.spi(vterin * 1000);
          continue;
        }
        throw new ImportChyba('RATE_LIMITED', `${moz.kontext}: HTTP 429, Retry-After ${r.headers.get('retry-after')}`);
      }
      if (r.status === 401 && !moz.uzivatel && !obnovenToken) {
        // Token aplikace mohl vypršet dřív, než jsme čekali.
        this.tokenApp = null;
        obnovenToken = true;
        continue;
      }
      if (r.status >= 500 && pokusy++ < 1) {
        await this.spi(800);
        continue;
      }
      throw this.chybaZeStavu(r.status, await kratkeTelo(r), moz);
    }
  }

  /** Všechny stránky za sebou, po `next`. */
  async vsechnyStranky(prvni: string, moz: MoznostiDotazu, strop = this.moz.maxPolozek ?? MAX_POLOZEK): Promise<unknown[]> {
    const polozky: unknown[] = [];
    let url: string | null = prvni;
    while (url && polozky.length < strop) {
      const stranka: any = await this.get(url, moz);
      const items = Array.isArray(stranka?.items) ? stranka.items : [];
      polozky.push(...items);
      url = typeof stranka?.next === 'string' && stranka.next ? stranka.next : null;
      if (!items.length) break;
    }
    return polozky.slice(0, strop);
  }

  async skladba(id: string, signal?: AbortSignal): Promise<NahledKolekce> {
    const raw = await this.get(`/tracks/${id}`, { signal, kontext: 'skladba' });
    const k = kolekceZeSkladby(raw);
    if (!k) throw new ImportChyba('METADATA_UNAVAILABLE', `skladba ${id}: odpověď bez názvu, interpreta nebo délky`);
    return k;
  }

  /**
   * Album i se všemi skladbami.
   *
   * Odpověď na album nese první stránku skladeb; další se dotáhnou po
   * `next`. Ušetří to dotaz u každého alba do padesáti skladeb.
   */
  async album(id: string, signal?: AbortSignal): Promise<NahledKolekce> {
    const raw = await this.get(`/albums/${id}`, { signal, kontext: 'album' });
    const prvni: any = raw?.tracks;
    let polozky: unknown[] = Array.isArray(prvni?.items) ? [...prvni.items] : [];
    if (typeof prvni?.next === 'string' && prvni.next) {
      polozky = polozky.concat(await this.vsechnyStranky(prvni.next, { signal, kontext: 'album' }));
    } else if (!prvni) {
      polozky = await this.vsechnyStranky(`/albums/${id}/tracks?limit=50`, { signal, kontext: 'album' });
    }
    return kolekceZAlba(raw, polozky);
  }

  /**
   * Playlist.
   *
   * Název a obal se čtou klíčem aplikace — ty vydá Spotify u každého
   * veřejného playlistu. Skladby jen s tokenem uživatele, a i tak jen
   * u jeho vlastního nebo sdíleného playlistu. Když obsah nejde, vrátí se
   * aspoň hlavička s vysvětlením, místo aby celý dotaz spadl.
   */
  async playlist(id: string, uzivatel?: string, signal?: AbortSignal): Promise<{ kolekce: NahledKolekce; upozorneni?: { kod: string; zprava: string } }> {
    const raw = await this.get(`/playlists/${id}`, { signal, kontext: 'playlist' });
    if (!uzivatel) {
      return {
        kolekce: kolekceZPlaylistu(raw, null),
        upozorneni: {
          kod: 'SPOTIFY_LOGIN_REQUIRED',
          zprava: 'Skladby z playlistu vydá Spotify jen jeho majiteli nebo spoluautorovi. Přihlas se ke Spotify.',
        },
      };
    }
    try {
      const polozky = await this.vsechnyStranky(
        `/playlists/${id}/items?limit=50&additional_types=track`,
        { signal, uzivatel, kontext: 'polozky' },
      );
      return { kolekce: kolekceZPlaylistu(raw, polozky) };
    } catch (e) {
      if (e instanceof ImportChyba && (e.kod === 'PLAYLIST_UNAVAILABLE' || e.kod === 'SPOTIFY_LOGIN_REQUIRED')) {
        return { kolekce: kolekceZPlaylistu(raw, null), upozorneni: { kod: e.kod, zprava: e.message } };
      }
      throw e;
    }
  }

  async interpret(id: string, signal?: AbortSignal): Promise<NahledInterpreta> {
    const raw = await this.get(`/artists/${id}`, { signal, kontext: 'interpret' });
    const alba = await this.vsechnyStranky(
      `/artists/${id}/albums?include_groups=album,single`,
      { signal, kontext: 'interpret' },
      MAX_ALB_INTERPRETA,
    );
    return interpretSAlby(raw, alba);
  }

  /** Hledání skladeb. Od února 2026 vydá Spotify nejvýš deset výsledků. */
  async hledej(dotaz: string, signal?: AbortSignal): Promise<NahledKolekce> {
    const q = dotaz.trim().slice(0, 200);
    if (!q) throw new ImportChyba('INVALID_URL', 'prázdný dotaz', 'Napiš, co hledáš.');
    const raw = await this.get(`/search?type=track&limit=10&q=${encodeURIComponent(q)}`, { signal, kontext: 'hledani' });
    return kolekceZHledani(q, raw);
  }

  /**
   * Rozbalí zkrácený odkaz z mobilní aplikace.
   *
   * Jde se jen po přesměrováních v rámci Spotify a nejvýš třikrát. Cíl
   * se hledá v hlavičce `Location`, a když ho odkaz vrátí až ve stránce,
   * tak v ní — ale zase jen adresu `open.spotify.com`.
   */
  async rozbalKratky(adresa: string, signal?: AbortSignal): Promise<string> {
    const povolene = /^https:\/\/(spotify\.link|spotify\.app\.link|open\.spotify\.com)\//i;
    let url = adresa;
    for (let krok = 0; krok < 3; krok++) {
      if (!povolene.test(url)) break;
      if (/^https:\/\/open\.spotify\.com\//i.test(url)) return url;
      let r: Response;
      try {
        r = await this.f(url, { redirect: 'manual', signal });
      } catch (e: any) {
        if (e?.name === 'AbortError') throw new ImportChyba('CANCELLED', 'zrušeno');
        throw new ImportChyba('SPOTIFY_API_ERROR', `zkrácený odkaz: ${e?.message || e}`);
      }
      const kam = r.headers.get('location');
      if (kam) {
        url = new URL(kam, url).toString();
        continue;
      }
      const telo = (await r.text().catch(() => '')).slice(0, 200_000);
      const nalez = telo.match(/https:\/\/open\.spotify\.com\/[A-Za-z0-9/_\-?=&.]+/);
      if (nalez) return nalez[0];
      break;
    }
    throw new ImportChyba('INVALID_URL', `zkrácený odkaz nevede na Spotify: ${adresa}`, 'Zkrácený odkaz se nepodařilo rozbalit. Otevři ho a zkopíruj celou adresu.');
  }

  /** Náhled podle toho, co člověk vložil. */
  async nahled(vstup: string, uzivatel?: string, signal?: AbortSignal): Promise<NahledOdpoved> {
    let rozbor = rozeberOdkaz(vstup);
    if (rozbor.stav === 'kratky') rozbor = rozeberOdkaz(await this.rozbalKratky(rozbor.adresa, signal));
    if (rozbor.stav === 'chyba') throw new ImportChyba(rozbor.kod, rozbor.detail);
    if (rozbor.stav !== 'ok') throw new ImportChyba('INVALID_URL', 'odkaz se nepodařilo rozebrat');

    const { druh, id } = rozbor.odkaz;
    switch (druh) {
      case 'track':
        return { druh: 'kolekce', kolekce: await this.skladba(id, signal) };
      case 'album':
        return { druh: 'kolekce', kolekce: await this.album(id, signal) };
      case 'playlist': {
        const { kolekce, upozorneni } = await this.playlist(id, uzivatel, signal);
        return { druh: 'kolekce', kolekce, ...(upozorneni ? { upozorneni } : {}) };
      }
      case 'artist':
        return { druh: 'interpret', interpret: await this.interpret(id, signal) };
    }
  }
}

/**
 * Brzda na dotazy od jednoho uživatele.
 *
 * Každý náhled playlistu jsou desítky dotazů na Spotify a limit má celá
 * aplikace dohromady. Kdyby někdo mačkal „Načíst" dokola, zablokoval by
 * import všem.
 */
export class OmezovacDotazu {
  private zaznamy = new Map<string, number[]>();

  constructor(
    private readonly max = 30,
    private readonly oknoMs = 60_000,
    private readonly ted: () => number = Date.now,
  ) {}

  povol(klic: string): boolean {
    const t = this.ted();
    const casy = (this.zaznamy.get(klic) || []).filter((c) => t - c < this.oknoMs);
    if (casy.length >= this.max) {
      this.zaznamy.set(klic, casy);
      return false;
    }
    casy.push(t);
    this.zaznamy.set(klic, casy);
    return true;
  }
}

/** Token uživatele z hlavičky — jen jeho tvar, jestli platí, řekne Spotify. */
export function platnyTokenUzivatele(x: unknown): string | undefined {
  const t = typeof x === 'string' ? x.trim() : '';
  return /^[A-Za-z0-9._~+/=-]{20,2000}$/.test(t) ? t : undefined;
}
