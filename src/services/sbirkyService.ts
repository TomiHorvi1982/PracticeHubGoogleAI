import { authService } from './authService';

/**
 * Sbírky a štítky.
 *
 * Kategorie říká, co soubor je — bicí sampl, MIDI, PDF. Sbírka říká,
 * odkud přišel: z které stažené banky nebo složky na disku. To dvoje
 * spolu nesouvisí. Jedna banka se po roztřídění rozpadne do několika
 * kategorií a v jedné kategorii pak leží kusy z deseti bank; sbírka je
 * pak jediné, co pořád drží pohromadě věci, které spolu ladí.
 *
 * Štítky jsou volnější: k jednomu souboru jich patří kolik chce a nesou,
 * co se do stromu složek nevejde — „temné", „na intro", „nahráno doma".
 */

export interface Sbirka {
  id: string;
  nazev: string;
  barva: string;
  zdroj: string | null;
  created_at: string;
  /** Kolik souborů do ní patří. */
  souboru: number;
}

/**
 * Barvy k rozlišení sbírek.
 *
 * Odstíny, které appka používá jinde — knihovna nemá být jiná obrazovka
 * než zbytek. Deset stačí; na víc sbírek se barva stejně přestane číst a
 * hledá se podle názvu.
 */
export const BARVY = [
  '#FF9F0A', '#30D158', '#0A84FF', '#BF5AF2', '#FF453A',
  '#FFD60A', '#64D2FF', '#AC8E68', '#FF375F', '#5AC8FA',
];

function hlavicky(): Record<string, string> {
  const token = authService.getCurrentSession()?.token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function nactiSbirky(): Promise<Sbirka[]> {
  const r = await fetch('/api/sbirky', { headers: hlavicky() });
  if (!r.ok) return [];
  return (await r.json()).sbirky || [];
}

export async function zalozSbirku(nazev: string, barva: string, zdroj?: string): Promise<Sbirka> {
  const r = await fetch('/api/sbirky', {
    method: 'POST',
    headers: hlavicky(),
    body: JSON.stringify({ nazev, barva, zdroj }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || 'Sbírku se nepodařilo založit.');
  return d.sbirka;
}

export async function upravSbirku(id: string, zmeny: { nazev?: string; barva?: string }): Promise<void> {
  const r = await fetch(`/api/sbirky/${id}`, {
    method: 'PATCH',
    headers: hlavicky(),
    body: JSON.stringify(zmeny),
  });
  if (!r.ok) throw new Error((await r.json())?.error || 'Změna se nepovedla.');
}

export async function smazSbirku(id: string): Promise<void> {
  const r = await fetch(`/api/sbirky/${id}`, { method: 'DELETE', headers: hlavicky() });
  if (!r.ok) throw new Error((await r.json())?.error || 'Smazání se nepovedlo.');
}

export async function nactiTagy(): Promise<{ tag: string; pocet: number }[]> {
  const r = await fetch('/api/tagy', { headers: hlavicky() });
  if (!r.ok) return [];
  return (await r.json()).tagy || [];
}

export interface HromadnaZmena {
  ids: string[];
  category?: string;
  subcategory?: string | null;
  pridatTagy?: string[];
  odebratTagy?: string[];
  /** `null` sbírku odebere, `undefined` ji nechá být. */
  sbirka?: string | null;
}

export async function hromadneUprav(zmena: HromadnaZmena): Promise<number> {
  const r = await fetch('/api/assets/hromadne', {
    method: 'POST',
    headers: hlavicky(),
    body: JSON.stringify(zmena),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || 'Úprava se nepovedla.');
  return d.upraveno || 0;
}

/**
 * Do které kategorie soubor patří podle přípony.
 *
 * Nahrát tisíc souborů a pak je ručně zařazovat po jednom nikdo nedodělá.
 * Odhad podle přípony trefí většinu; co netrefí, se opraví hromadně.
 */
export function odhadniKategorii(nazev: string): { kategorie: string; typ: string } {
  const p = (nazev.split('.').pop() || '').toLowerCase();
  if (['mid', 'midi'].includes(p)) return { kategorie: 'midi', typ: 'midi' };
  if (['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gtp'].includes(p)) return { kategorie: 'guitar_pro', typ: 'guitar_pro' };
  if (p === 'pdf') return { kategorie: 'pdf', typ: 'pdf' };
  if (['sf2', 'sf3', 'sfz'].includes(p)) return { kategorie: 'soundfont', typ: 'preset' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(p)) return { kategorie: 'images', typ: 'image' };
  if (['txt', 'chordpro', 'pro', 'crd', 'md'].includes(p)) return { kategorie: 'documents', typ: 'pdf' };
  if (['wav', 'mp3', 'aiff', 'aif', 'flac', 'ogg', 'm4a'].includes(p)) {
    return { kategorie: 'drum_kit_sample', typ: 'sample' };
  }
  return { kategorie: 'documents', typ: 'pdf' };
}
