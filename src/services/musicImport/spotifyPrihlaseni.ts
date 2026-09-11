import { cekejNaNavrat } from '../oauthOkno';
import { nahodnyVerifier, vyzvaZVerifieru } from '../pkce';

/**
 * Přihlášení ke Spotify (Authorization Code + PKCE).
 *
 * Potřeba jen na jednu věc: od února 2026 vydá Spotify skladby playlistu
 * jen jeho majiteli nebo spoluautorovi, a to s jeho vlastním tokenem.
 * Skladby, alba, interpreti a hledání jdou bez přihlášení přes klíč
 * aplikace na serveru.
 *
 * PKCE, protože prohlížeč tajný klíč mít nesmí. Postup je stejný jako u
 * TONE3000 a pomůcky se s ním sdílejí (`pkce.ts`, `oauthOkno.ts`).
 *
 * Token zůstává v `sessionStorage` té karty: zavřením karty zmizí. Na
 * server jde jen s dotazem na obsah playlistu a server ho nikam neukládá.
 *
 * Omezení Spotify, o kterých je dobré vědět: aplikace ve vývojovém režimu
 * pustí jen uživatele zapsané v jejím nastavení (nové aplikace nejvýš
 * pět) a vlastník aplikace musí mít aktivní Premium.
 */

export const AUTORIZACE = 'https://accounts.spotify.com/authorize';
export const TOKEN = 'https://accounts.spotify.com/api/token';
export const CESTA_NAVRATU = '/spotify-callback.html';
/** Jen čtení playlistů. Nic víc aplikace nepotřebuje, tak o nic víc nežádá. */
export const OPRAVNENI = ['playlist-read-private', 'playlist-read-collaborative'];

const KLIC_TOKENY = 'spotify_tokeny';
const KLIC_STATE = 'spotify_state';
const KLIC_VERIFIER = 'spotify_verifier';

export interface TokenySpotify {
  access_token: string;
  refresh_token?: string;
  plati_do: number;
}

export function klientId(): string {
  return ((import.meta as any).env?.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim() || '';
}

export function adresaNavratu(): string {
  return `${window.location.origin}${CESTA_NAVRATU}`;
}

export function urlAutorizace(p: { clientId: string; navrat: string; vyzva: string; state: string }): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    scope: OPRAVNENI.join(' '),
    redirect_uri: p.navrat,
    code_challenge_method: 'S256',
    code_challenge: p.vyzva,
    state: p.state,
  });
  return `${AUTORIZACE}?${q}`;
}

export type NavratSpotify = { ok: true; code: string } | { ok: false; chyba: string };

/**
 * Přečte návrat z přihlášení.
 *
 * `state` se kontroluje první. Bez něj by stačilo někoho nalákat na
 * odkaz s cizím kódem a aplikace by se přihlásila za útočníka.
 */
export function precitNavrat(hledani: string, ocekavanyState: string | null): NavratSpotify {
  const q = new URLSearchParams(hledani);
  if (!ocekavanyState || q.get('state') !== ocekavanyState) {
    return { ok: false, chyba: 'Návrat z přihlášení nesedí. Zkus se přihlásit znovu.' };
  }
  const chyba = q.get('error');
  if (chyba) {
    return {
      ok: false,
      chyba: chyba === 'access_denied' ? 'Přihlášení ke Spotify bylo odmítnuto.' : `Spotify vrátilo chybu: ${chyba}`,
    };
  }
  const code = q.get('code');
  return code ? { ok: true, code } : { ok: false, chyba: 'Návrat z přihlášení je bez kódu.' };
}

/** Obnovit token s předstihem, ať nevyprší uprostřed načítání playlistu. */
export function vyprsi(platiDo: number, ted = Date.now(), rezerva = 60_000): boolean {
  return platiDo - rezerva <= ted;
}

type Poslucha = () => void;

class SpotifyPrihlaseni {
  private tokeny: TokenySpotify | null = null;
  private posluchaci = new Set<Poslucha>();

  constructor() {
    try {
      const s = sessionStorage.getItem(KLIC_TOKENY);
      if (s) this.tokeny = JSON.parse(s);
    } catch { /* rozbitý zápis se zahodí, přihlásí se znovu */ }
  }

  subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    return () => { this.posluchaci.delete(f); };
  }

  private oznam(): void { this.posluchaci.forEach((f) => f()); }

  nastaveno(): boolean { return !!klientId(); }

  prihlasen(): boolean { return !!this.tokeny; }

  odhlas(): void {
    this.tokeny = null;
    try { sessionStorage.removeItem(KLIC_TOKENY); } catch { /* nevadí */ }
    this.oznam();
  }

  private uloz(d: any, stary?: TokenySpotify | null): void {
    this.tokeny = {
      access_token: String(d.access_token),
      // Při obnově Spotify nový obnovovací token posílat nemusí — pak platí starý.
      refresh_token: d.refresh_token || stary?.refresh_token,
      plati_do: Date.now() + (Number(d.expires_in) || 3600) * 1000,
    };
    try { sessionStorage.setItem(KLIC_TOKENY, JSON.stringify(this.tokeny)); } catch { /* nevadí */ }
    this.oznam();
  }

  async prihlas(signal?: AbortSignal): Promise<{ ok: boolean; chyba?: string }> {
    const id = klientId();
    if (!id) return { ok: false, chyba: 'Přihlášení ke Spotify není nastavené (chybí VITE_SPOTIFY_CLIENT_ID).' };

    const verifier = nahodnyVerifier();
    const state = nahodnyVerifier(32);
    sessionStorage.setItem(KLIC_VERIFIER, verifier);
    sessionStorage.setItem(KLIC_STATE, state);

    const url = urlAutorizace({ clientId: id, navrat: adresaNavratu(), vyzva: await vyzvaZVerifieru(verifier), state });
    const okno = window.open(url, 'spotify-prihlaseni', 'width=520,height=760');
    if (!okno) return { ok: false, chyba: 'Prohlížeč zablokoval okno. Povol vyskakovací okna.' };

    const v = await cekejNaNavrat('spotify-navrat', { ocekavanyState: state, signal });
    // Porovnáním, ne `!v.ok`: bez strictNullChecks by se unie nezúžila.
    if (v.ok === false) return { ok: false, chyba: v.chyba };
    const n = precitNavrat(v.hledani, sessionStorage.getItem(KLIC_STATE));
    if (n.ok === false) return { ok: false, chyba: n.chyba };

    try {
      const r = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: n.code,
          redirect_uri: adresaNavratu(),
          client_id: id,
          code_verifier: verifier,
        }),
      });
      if (!r.ok) return { ok: false, chyba: `Výměna kódu u Spotify selhala (${r.status}).` };
      this.uloz(await r.json());
      return { ok: true };
    } catch (e: any) {
      return { ok: false, chyba: e?.message || 'Token se nepodařilo získat.' };
    } finally {
      sessionStorage.removeItem(KLIC_VERIFIER);
      sessionStorage.removeItem(KLIC_STATE);
    }
  }

  /**
   * Platný token, nebo `null`.
   *
   * Vypršelý se obnoví. Když obnova selže, přihlášení se zahodí — lepší
   * požádat o nové, než posílat token, o kterém víme, že neprojde.
   */
  async platnyToken(): Promise<string | null> {
    const t = this.tokeny;
    if (!t) return null;
    if (!vyprsi(t.plati_do)) return t.access_token;
    if (!t.refresh_token) {
      this.odhlas();
      return null;
    }
    try {
      const r = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: klientId() }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.uloz(await r.json(), t);
      return this.tokeny!.access_token;
    } catch {
      this.odhlas();
      return null;
    }
  }
}

export const spotifyPrihlaseni = new SpotifyPrihlaseni();
