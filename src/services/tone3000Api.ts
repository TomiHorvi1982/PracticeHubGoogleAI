/**
 * Oficiální TONE3000 API — OAuth 2.0 s PKCE.
 *
 * Postaveno podle dokumentace na https://www.tone3000.com/api. Nic, co
 * tam není popsané, se odsud nevolá: kdyby si služba endpointy přerovnala,
 * ať to spadne na známém místě a ne na vymyšleném.
 *
 * Proč PKCE a žádné tajemství: TONE3000 rozlišuje dva klíče. Publishable
 * key (`t3k_pk_…`) je `client_id`, dokumentace ho výslovně označuje za
 * bezpečný do prohlížeče a nic jiného tenhle tok nepotřebuje. Secret key
 * (`t3k_cs_…`) je serverové heslo — v téhle appce se nepoužívá vůbec,
 * takže se nemá jak dostat do balíčku.
 *
 * Tokeny bydlí v `sessionStorage`, jak to dělá i referenční klient
 * TONE3000: zavřením karty zmizí a nepřežijí na disku.
 */

export const T3K_ZAKLAD = 'https://www.tone3000.com/api/v1';
export const T3K_AUTORIZACE = `${T3K_ZAKLAD}/oauth/authorize`;
export const T3K_TOKEN = `${T3K_ZAKLAD}/oauth/token`;

/** Kam se uživatel vrací po přihlášení. Musí sedět s adresou v nastavení TONE3000. */
export const CESTA_NAVRATU = '/tone3000-callback.html';

/**
 * Odkud se smí stahovat s naším tokenem.
 *
 * `model_url` přichází v odpovědi, tedy od protistrany. Kdyby ukázal
 * jinam, poslali bychom přístupový token na cizí server. Na cizí adresu
 * se proto jde bez hlavičky — a když je soubor opravdu jejich, prostě
 * to projde.
 */
export const DOMENA_T3K = 'tone3000.com';

/** Dokumentovaný strop: 100 dotazů za minutu. Držíme se pod ním. */
export const STROP_ZA_MINUTU = 100;

export type Gear =
  | 'amp' | 'amp-cab' | 'pedal' | 'outboard' | 'cab' | 'space' | 'experimental';
export type Format = 'nam' | 'ir' | 'aida-x' | 'aa-snapshot' | 'proteus';
export type Architektura = '1' | '2' | 'custom';

export const GEARY: { id: Gear; nazev: string }[] = [
  { id: 'amp-cab', nazev: 'Aparát + bedna' },
  { id: 'amp', nazev: 'Aparát' },
  { id: 'cab', nazev: 'Bedna' },
  { id: 'pedal', nazev: 'Krabička' },
  { id: 'outboard', nazev: 'Studiovka' },
  { id: 'space', nazev: 'Prostor' },
  { id: 'experimental', nazev: 'Pokusy' },
];

export type Razeni = 'best-match' | 'trending' | 'newest' | 'downloads-all-time';

export interface Uzivatel {
  id: number;
  username: string;
  display_name: string | null;
  is_verified: boolean;
  avatar_url: string | null;
  url: string;
}

export interface Ton {
  id: number;
  title: string;
  description: string | null;
  gear: Gear;
  format: Format;
  images: string[] | null;
  user: Uzivatel;
  makes: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  models_count: number;
  irs_count: number;
  downloads_count: number;
  favorites_count: number;
  is_favorite: boolean;
  url: string;
}

export interface ModelT3K {
  id: number;
  name: string;
  model_url: string;
  size: string;
  tone_id: number;
  architecture_version: Architektura | null;
}

export interface Strankovane<T> {
  data: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface Tokeny {
  access_token: string;
  refresh_token: string;
  /** Kdy token vyprší, v milisekundách od epochy. */
  plati_do: number;
}

/* ---------------------------------------------------------------- PKCE */

const ABECEDA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Náhodný `code_verifier`.
 *
 * Podle RFC 7636 má být 43–128 znaků z nevyhrazené abecedy. Bereme 64,
 * a z `crypto.getRandomValues` — `Math.random` se na tohle nehodí.
 */
export function nahodnyVerifier(delka = 64): string {
  const b = new Uint8Array(delka);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += ABECEDA[x % ABECEDA.length];
  return s;
}

/** Base64url bez výplně — tvar, který OAuth čeká. */
export function base64url(data: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(data)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `code_challenge` = base64url(SHA-256(verifier)), metoda S256. */
export async function vyzvaZVerifieru(verifier: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(h);
}

export interface ParametryAutorizace {
  clientId: string;
  navrat: string;
  vyzva: string;
  state: string;
  /** Chybí = obyčejné přihlášení; `select_tone` = uživatel si vybírá tón u nich. */
  prompt?: 'select_tone' | 'load_tone';
  toneId?: number;
  gears?: Gear[];
  format?: Format;
  architecture?: Architektura;
  /** Lišta se zpět/vpřed/zavřít — v okně bez adresního řádku se hodí. */
  menubar?: boolean;
  /** Přehrávače ukázek přímo ve výběru. */
  preview?: boolean;
}

export function urlAutorizace(p: ParametryAutorizace): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.navrat,
    response_type: 'code',
    code_challenge: p.vyzva,
    code_challenge_method: 'S256',
    state: p.state,
  });
  if (p.prompt) q.set('prompt', p.prompt);
  if (p.toneId != null) q.set('tone_id', String(p.toneId));
  // Víc gearů se odděluje podtržítkem, ne čárkou.
  if (p.gears?.length) q.set('gears', p.gears.join('_'));
  if (p.format) q.set('format', p.format);
  if (p.architecture) q.set('architecture', p.architecture);
  if (p.menubar) q.set('menubar', 'true');
  if (p.preview) q.set('preview', 'true');
  return `${T3K_AUTORIZACE}?${q}`;
}

export interface Navrat {
  ok: boolean;
  code?: string;
  toneId?: number;
  chyba?: string;
}

/**
 * Přečte, s čím se uživatel vrátil.
 *
 * `state` se kontroluje první — bez něj by stačilo někoho nalákat na
 * cizí odkaz s návratem a podstrčit mu cizí účet.
 */
export function precitNavrat(hledani: string, ocekavanyState: string | null): Navrat {
  const q = new URLSearchParams(hledani.startsWith('?') ? hledani.slice(1) : hledani);
  const state = q.get('state');
  if (!ocekavanyState || state !== ocekavanyState) {
    return { ok: false, chyba: 'Návrat nesedí s tím, co jsme poslali. Zkus přihlášení znovu.' };
  }
  const chyba = q.get('error');
  if (chyba) {
    return {
      ok: false,
      chyba: chyba === 'access_denied' ? 'Přihlášení jsi zrušil.' : `TONE3000 vrátil: ${chyba}`,
    };
  }
  const code = q.get('code');
  if (!code) return { ok: false, chyba: 'TONE3000 nevrátil kód. Zkus to prosím znovu.' };
  const tone = Number(q.get('tone_id'));
  return { ok: true, code, toneId: Number.isFinite(tone) && tone > 0 ? tone : undefined };
}

/* ------------------------------------------------------------- Pomůcky */

/** Vyprší do minuty? Obnovujeme s předstihem, ať dotaz nespadne v půlce. */
export function vyprsi(platiDo: number, ted = Date.now(), rezerva = 60_000): boolean {
  return ted + rezerva >= platiDo;
}

/**
 * Smí k té adrese jít náš token?
 *
 * Jen na jejich doménu. Cokoli jiného se stáhne bez hlavičky.
 */
export function jejichAdresa(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return u.hostname === DOMENA_T3K || u.hostname.endsWith(`.${DOMENA_T3K}`);
  } catch { return false; }
}

export function hlavickyProStazeni(url: string, token: string): Record<string, string> {
  return jejichAdresa(url) ? { Authorization: `Bearer ${token}` } : {};
}

/** Z názvu modelu poznáme, jestli je to aparát nebo bedna. */
export function typModelu(m: { model_url: string; architecture_version: Architektura | null }):
  'nam' | 'ir' {
  if (/\.wav(\?|$)/i.test(m.model_url)) return 'ir';
  if (/\.nam(\?|$)/i.test(m.model_url)) return 'nam';
  // Architektura je vyplněná jen u NAM; u IR je null.
  return m.architecture_version ? 'nam' : 'ir';
}

/** Jméno tvůrce tak, jak se má ukazovat. `display_name` mají jen ověření. */
export function jmenoTvurce(u: Uzivatel): string {
  return u.display_name || u.username;
}

/**
 * Hlídač dotazů.
 *
 * Sto za minutu je dost, ale hledání je podle dokumentace škrcené zvlášť.
 * Radši si počkáme, než abychom dostali 429 a museli to vysvětlovat.
 */
export class Hlidac {
  private casy: number[] = [];

  constructor(private strop = STROP_ZA_MINUTU) {}

  /** Kolik milisekund je potřeba počkat, než smí jít další dotaz. */
  public cekani(ted = Date.now()): number {
    this.casy = this.casy.filter((t) => ted - t < 60_000);
    if (this.casy.length < this.strop) return 0;
    return 60_000 - (ted - this.casy[0]);
  }

  public zapis(ted = Date.now()): void {
    this.casy.push(ted);
  }
}

/* -------------------------------------------------------------- Klient */

const KLIC_TOKENY = 't3k_tokeny';
const KLIC_STATE = 't3k_state';
const KLIC_VERIFIER = 't3k_verifier';

export function klientId(): string {
  return (import.meta.env?.VITE_TONE3000_CLIENT_ID as string | undefined)?.trim() || '';
}

export function adresaNavratu(): string {
  return `${window.location.origin}${CESTA_NAVRATU}`;
}

type Poslucha = () => void;

/**
 * Přístup k API.
 *
 * Drží tokeny, obnovuje je sám a hlídá počet dotazů. Chyby vrací jako
 * `Error` s českou hláškou — komponenta ji jen ukáže.
 */
class Tone3000Klient {
  private tokeny: Tokeny | null = null;
  private obnova: Promise<void> | null = null;
  private hlidac = new Hlidac();
  private posluchaci = new Set<Poslucha>();

  constructor() {
    try {
      const s = sessionStorage.getItem(KLIC_TOKENY);
      if (s) this.tokeny = JSON.parse(s);
    } catch { /* rozbitý zápis se prostě zahodí, přihlásí se znovu */ }
  }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    return () => { this.posluchaci.delete(f); };
  }

  private oznam(): void { this.posluchaci.forEach((f) => f()); }

  public nastaveno(): boolean { return !!klientId(); }

  public prihlasen(): boolean { return !!this.tokeny; }

  public odhlas(): void {
    this.tokeny = null;
    try { sessionStorage.removeItem(KLIC_TOKENY); } catch { /* nevadí */ }
    this.oznam();
  }

  private uloz(t: Tokeny): void {
    this.tokeny = t;
    try { sessionStorage.setItem(KLIC_TOKENY, JSON.stringify(t)); } catch { /* nevadí */ }
    this.oznam();
  }

  /**
   * Otevře přihlášení v samostatném okně a počká na návrat.
   *
   * Okno, a ne přesměrování celé stránky: v pultu můžou hrát stopy a
   * běžet živá kytara. Odejít pryč a vrátit se by znamenalo postavit to
   * celé znovu.
   */
  public async prihlas(prompt?: 'select_tone', filtr?: Partial<ParametryAutorizace>):
    Promise<{ ok: boolean; toneId?: number; chyba?: string }> {
    const id = klientId();
    if (!id) return { ok: false, chyba: 'Chybí klíč TONE3000 (VITE_TONE3000_CLIENT_ID).' };

    const verifier = nahodnyVerifier();
    const state = nahodnyVerifier(32);
    sessionStorage.setItem(KLIC_VERIFIER, verifier);
    sessionStorage.setItem(KLIC_STATE, state);

    const url = urlAutorizace({
      clientId: id,
      navrat: adresaNavratu(),
      vyzva: await vyzvaZVerifieru(verifier),
      state,
      prompt,
      menubar: true,
      preview: prompt === 'select_tone' ? true : undefined,
      ...filtr,
    });

    const okno = window.open(url, 't3k', 'width=1100,height=800');
    if (!okno) return { ok: false, chyba: 'Prohlížeč zablokoval okno. Povol vyskakovací okna.' };

    const navrat = await this.pockejNaNavrat(okno);
    if (!navrat.ok) return { ok: false, chyba: navrat.chyba };

    try {
      await this.vymenKod(navrat.code!, verifier);
      return { ok: true, toneId: navrat.toneId };
    } catch (e: any) {
      return { ok: false, chyba: e?.message || 'Token se nepodařilo získat.' };
    }
  }

  /** Poslouchá zprávu od návratové stránky; hlídá i zavření okna rukou. */
  private pockejNaNavrat(okno: Window): Promise<Navrat> {
    return new Promise((hotovo) => {
      const konec = (v: Navrat) => {
        window.removeEventListener('message', prijmi);
        clearInterval(hlidani);
        hotovo(v);
      };
      const prijmi = (e: MessageEvent) => {
        // Zpráva smí přijít jen z naší vlastní stránky.
        if (e.origin !== window.location.origin) return;
        if (!e.data || e.data.typ !== 't3k-navrat') return;
        konec(precitNavrat(String(e.data.hledani || ''), sessionStorage.getItem(KLIC_STATE)));
      };
      window.addEventListener('message', prijmi);
      const hlidani = window.setInterval(() => {
        if (okno.closed) konec({ ok: false, chyba: 'Okno bylo zavřené dřív, než se to dokončilo.' });
      }, 500);
    });
  }

  private async vymenKod(code: string, verifier: string): Promise<void> {
    const r = await fetch(T3K_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: adresaNavratu(),
        client_id: klientId(),
      }),
    });
    if (!r.ok) throw new Error(`Výměna kódu selhala (${r.status}).`);
    const d = await r.json();
    this.uloz({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      plati_do: Date.now() + (Number(d.expires_in) || 3600) * 1000,
    });
  }

  /**
   * Obnoví token.
   *
   * `invalid_grant` znamená, že vypršel i obnovovací token — pak se
   * všechno zahodí a jde se přihlásit znovu, jak radí dokumentace.
   */
  private async obnovToken(): Promise<void> {
    if (!this.tokeny) throw new Error('Nejsi přihlášený k TONE3000.');
    const r = await fetch(T3K_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokeny.refresh_token,
        client_id: klientId(),
      }),
    });
    if (!r.ok) {
      this.odhlas();
      throw new Error('Přihlášení vypršelo. Přihlas se prosím znovu.');
    }
    const d = await r.json();
    this.uloz({
      access_token: d.access_token,
      refresh_token: d.refresh_token || this.tokeny.refresh_token,
      plati_do: Date.now() + (Number(d.expires_in) || 3600) * 1000,
    });
  }

  /** Platný token — obnovuje se s předstihem a vždycky jen jednou naráz. */
  private async token(): Promise<string> {
    if (!this.tokeny) throw new Error('Nejsi přihlášený k TONE3000.');
    if (vyprsi(this.tokeny.plati_do)) {
      if (!this.obnova) {
        this.obnova = this.obnovToken().finally(() => { this.obnova = null; });
      }
      await this.obnova;
    }
    return this.tokeny!.access_token;
  }

  private async zadej<T>(cesta: string, parametry?: Record<string, string | number | undefined>):
    Promise<T> {
    const cekat = this.hlidac.cekani();
    if (cekat > 0) {
      throw new Error(`Moc dotazů za sebou. Zkus to za ${Math.ceil(cekat / 1000)} s.`);
    }
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(parametry || {})) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    const url = `${T3K_ZAKLAD}${cesta}${q.toString() ? `?${q}` : ''}`;
    const t = await this.token();
    this.hlidac.zapis();
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    });
    if (r.status === 401) {
      this.odhlas();
      throw new Error('TONE3000 nás odhlásil. Přihlas se prosím znovu.');
    }
    if (r.status === 429) {
      const po = Number(r.headers.get('retry-after'));
      throw new Error(Number.isFinite(po) && po > 0
        ? `TONE3000 nás přibrzdil. Zkus to za ${po} s.`
        : 'TONE3000 nás přibrzdil. Zkus to za chvíli.');
    }
    if (r.status === 403) throw new Error('Na tohle nemá tvůj účet přístup.');
    if (r.status === 404) throw new Error('Tenhle tón už na TONE3000 není.');
    if (!r.ok) throw new Error(`TONE3000 vrátil ${r.status}.`);
    return await r.json() as T;
  }

  /* --- dokumentované endpointy --- */

  public ja(): Promise<Uzivatel> { return this.zadej('/user'); }

  public hledej(o: {
    query?: string; page?: number; page_size?: number; sort?: Razeni;
    gears?: Gear[]; format?: Format; architecture?: Architektura;
  }): Promise<Strankovane<Ton>> {
    return this.zadej('/tones/search', {
      query: o.query,
      page: o.page ?? 1,
      // Dokumentace u hledání připouští nejvýš 25 na stránku.
      page_size: Math.min(25, o.page_size ?? 24),
      sort: o.sort,
      gears: o.gears?.length ? o.gears.join('_') : undefined,
      format: o.format,
      architecture: o.architecture,
    });
  }

  public trending(gear?: Gear): Promise<{ data: Ton[] }> {
    return this.zadej('/tones/trending', { gear });
  }

  public nejnovejsi(): Promise<{ data: Ton[] }> { return this.zadej('/tones/latest'); }

  public oblibene(page = 1, gear?: Gear): Promise<Strankovane<Ton>> {
    return this.zadej('/tones/favorited', { page, page_size: 24, gear });
  }

  public vytvorene(page = 1, gear?: Gear): Promise<Strankovane<Ton>> {
    return this.zadej('/tones/created', { page, page_size: 24, gear });
  }

  public stazene(page = 1, gear?: Gear): Promise<Strankovane<Ton>> {
    return this.zadej('/tones/downloaded', { page, page_size: 24, gear });
  }

  public ton(id: number, architecture?: Architektura): Promise<Ton> {
    return this.zadej(`/tones/${Math.round(id)}`, { architecture });
  }

  public modely(toneId: number, architecture?: Architektura): Promise<Strankovane<ModelT3K>> {
    return this.zadej('/models', {
      tone_id: Math.round(toneId), page: 1, page_size: 100, architecture,
    });
  }

  /** Oblíbení tónu. Je idempotentní, takže se dá klikat bez obav. */
  public async oblib(toneId: number, zapnout: boolean): Promise<void> {
    const t = await this.token();
    const r = await fetch(`${T3K_ZAKLAD}/tones/${Math.round(toneId)}/favorite`, {
      method: zapnout ? 'PUT' : 'DELETE',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) throw new Error(`Oblíbené se nepodařilo změnit (${r.status}).`);
  }

  /** Stáhne soubor modelu. Token jde s sebou jen na jejich doménu. */
  public async stahni(modelUrl: string): Promise<ArrayBuffer> {
    const t = await this.token();
    const r = await fetch(modelUrl, { headers: hlavickyProStazeni(modelUrl, t) });
    if (!r.ok) throw new Error(`Soubor se nepodařilo stáhnout (${r.status}).`);
    return await r.arrayBuffer();
  }
}

export const tone3000 = new Tone3000Klient();
