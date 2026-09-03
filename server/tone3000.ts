/**
 * Katalog Tone3000 — modely aparátů (.nam) a impulzy (IR).
 *
 * Oficiální API chce klíč a bez něj vrací 401. Soundshed na ně má proxy,
 * která klíč nepotřebuje, a jede přes ni i stahování souborů. Zatím se
 * chodí tudy; `TONE3000_BASE` v .env to přepne na vlastní přípojku, až
 * bude klíč.
 *
 * Ke všemu, co odsud odejde ven, se přistupuje jako k cizímu textu:
 * jména souborů i adresy ke stažení přicházejí z odpovědi služby, tedy
 * odjinud než od nás. Jméno může nést lomítka a přepsat soubor mimo
 * složku, adresa může ukazovat kamkoli. Obojí se proto ověřuje tady
 * a je na to zvlášť testováno.
 */

export const PROXY_SOUNDSHED = 'https://api-guitar.soundshed.com/v1/resourcesearch';

/**
 * Odkud se smí stahovat.
 *
 * Adresa souboru přijde v odpovědi katalogu, takže ji řídí protistrana.
 * Bez tohohle seznamu by stačilo, aby vrátila odkaz na cizí server,
 * a náš server by pro ni ochotně došel, kam by řekla.
 */
export const POVOLENE_HOSTY = [
  'api-guitar.soundshed.com',
  'www.tone3000.com',
  'api.tone3000.com',
];

export type Razeni = 'best-match' | 'downloads-all-time' | 'newest' | 'trending';
export const RAZENI: { id: Razeni; nazev: string }[] = [
  { id: 'downloads-all-time', nazev: 'Nejstahovanější' },
  { id: 'trending', nazev: 'Teď populární' },
  { id: 'newest', nazev: 'Nejnovější' },
  { id: 'best-match', nazev: 'Nejlepší shoda' },
];

export interface Ton {
  id: number;
  nazev: string;
  popis?: string;
  znacky: string[];
  poctyModelu: number;
  poctyIr: number;
  stazeni: number;
  obrazek?: string;
}

export interface Model {
  id: number;
  nazev: string;
  /** Adresa ke stažení, už přepsaná na proxy. */
  odkaz: string;
  typ: 'nam' | 'ir';
  velikost?: number;
}

function zaklad(): string {
  return (process.env.TONE3000_BASE || PROXY_SOUNDSHED).replace(/\/+$/, '');
}

export function urlHledani(dotaz: string, razeni: Razeni, strana: number, naStranu: number): string {
  const p = new URLSearchParams({
    page: String(Math.max(1, Math.round(strana) || 1)),
    page_size: String(Math.min(50, Math.max(1, Math.round(naStranu) || 20))),
    sort: razeni,
  });
  const q = dotaz.trim();
  if (q) p.set('query', q);
  return `${zaklad()}/tones/search?${p}`;
}

export function urlModelu(toneId: number, strana = 1, naStranu = 100): string {
  const p = new URLSearchParams({
    tone_id: String(Math.round(toneId)),
    page: String(Math.max(1, Math.round(strana) || 1)),
    page_size: String(Math.min(200, Math.max(1, Math.round(naStranu) || 100))),
  });
  return `${zaklad()}/models?${p}`;
}

/**
 * Přepíše odkaz na soubor tak, aby šel přes proxy.
 *
 * Katalog vrací adresy na `www.tone3000.com/api/v1/...`, jenže tam bez
 * klíče čeká 401. Cesta za `/api/v1` je u obou stejná, takže se jen
 * vymění začátek. Adresa mimo povolené hosty se zahodí — nepřepisuje se.
 */
export function urlPresProxy(odkaz: string): string | null {
  if (!jeBezpecnaAdresa(odkaz)) return null;
  const u = new URL(odkaz);
  const m = /\/api\/v1\/(.*)$/.exec(u.pathname);
  const cesta = m ? m[1] : u.pathname.replace(/^\/+/, '');
  return `${zaklad()}/${cesta}${u.search}`;
}

/** Je adresa z místa, odkud smíme stahovat? */
export function jeBezpecnaAdresa(odkaz: string): boolean {
  try {
    const u = new URL(odkaz);
    // Jen https: http by šlo odposlechnout a podvrhnout obsah.
    return u.protocol === 'https:' && POVOLENE_HOSTY.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Jméno souboru na disk.
 *
 * Jméno přichází z katalogu, takže může obsahovat lomítka, `..` i znaky,
 * které by se do názvu neměly dostat. Zůstane z něj jen to neškodné;
 * když nezbude nic, použije se ID.
 */
export function bezpecneJmeno(nazev: string, id: number, typ: 'nam' | 'ir'): string {
  const pripona = typ === 'nam' ? '.nam' : '.wav';
  const ocistene = String(nazev || '')
    .replace(/[\\/]/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/[^\p{L}\p{N} _.()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/^[.\s]+/, '');
  return ocistene ? `${ocistene} [${id}]${pripona}` : `tone3000-${id}${pripona}`;
}

/** Model, nebo impulz? Pozná se podle přípony v odkazu. */
export function typSouboru(odkaz: string): 'nam' | 'ir' | null {
  const bez = odkaz.split('?')[0].toLowerCase();
  if (bez.endsWith('.nam') || bez.endsWith('.json')) return 'nam';
  if (bez.endsWith('.wav')) return 'ir';
  return null;
}

/** Vytáhne pole z odpovědi, ať přijde jako `{data:[…]}` nebo rovnou pole. */
function pole(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const k of ['data', 'tones', 'models', 'results', 'items']) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

export function normalizujTony(payload: any): Ton[] {
  return pole(payload)
    .filter((t) => Number.isFinite(Number(t?.id)))
    .map((t) => ({
      id: Number(t.id),
      nazev: String(t.title || t.name || 'Bez názvu'),
      popis: typeof t.description === 'string' ? t.description.slice(0, 300) : undefined,
      znacky: Array.isArray(t.tags)
        ? t.tags.map((z: any) => String(z?.name ?? z)).filter(Boolean).slice(0, 8)
        : [],
      poctyModelu: Number(t.models_count) || 0,
      poctyIr: Number(t.irs_count) || 0,
      stazeni: Number(t.downloads_count) || 0,
      obrazek: Array.isArray(t.images) && jeBezpecnaAdresa(String(t.images[0]))
        ? String(t.images[0]) : undefined,
    }));
}

export function normalizujModely(payload: any): Model[] {
  return pole(payload)
    .map((m) => {
      const puvodni = String(m?.model_url || m?.url || '');
      const typ = typSouboru(puvodni);
      const odkaz = urlPresProxy(puvodni);
      if (!typ || !odkaz || !Number.isFinite(Number(m?.id))) return null;
      return {
        id: Number(m.id),
        nazev: String(m.name || `Model ${m.id}`),
        odkaz,
        typ,
        velikost: Number(m.size) || undefined,
      } as Model;
    })
    .filter((m): m is Model => m !== null);
}

/** Kolik stránek celkem — do stránkování v seznamu. */
export function stranek(payload: any): number {
  const c = Number(payload?.total_pages);
  return Number.isFinite(c) && c > 0 ? c : 1;
}

export function celkem(payload: any): number {
  const c = Number(payload?.total ?? payload?.total_count ?? payload?.count);
  return Number.isFinite(c) && c >= 0 ? c : 0;
}
