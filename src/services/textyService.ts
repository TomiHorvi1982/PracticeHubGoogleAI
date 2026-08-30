import { authService } from './authService';

/**
 * Tvorba textů.
 *
 * Dvě věci, které spolu souvisí víc, než se zdá: přepsat, co už zaznělo,
 * a napsat, co ještě ne. Přepis dá první nástřel a rozvržení do času;
 * editor z něj udělá text, který se dá zpívat.
 *
 * Počítání slabik a hledání rýmů je tady, ne na serveru — jsou to
 * pravidla, ne data, a psaní textu nesnese čekání na odpověď u každého
 * znaku.
 */

export interface UsekPrepisu {
  zacatek: number;
  konec: number;
  text: string;
}

export type FazePrepisu = 'priprava' | 'vokal' | 'prepis' | 'hotovo' | 'chyba';

export interface StavPrepisu {
  faze: FazePrepisu;
  postup: number;
  zprava: string;
  useky: UsekPrepisu[];
  chyba: string | null;
}

function hlavicky(): Record<string, string> {
  const token = authService.getCurrentSession()?.token;
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
}

export async function pripravenost(): Promise<{ ok: boolean; chybi: string[]; bezi: boolean }> {
  const r = await fetch('/api/texty/pripravenost', { headers: hlavicky() });
  if (!r.ok) return { ok: false, chybi: ['server neodpověděl'], bezi: false };
  return r.json();
}

export async function spustPrepis(
  assetId: string,
  oddelitVokal: boolean,
  jazyk = 'auto'
): Promise<string> {
  const r = await fetch('/api/texty/prepis', {
    method: 'POST',
    headers: hlavicky(),
    body: JSON.stringify({ assetId, oddelitVokal, jazyk }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || 'Přepis se nepodařilo spustit.');
  return d.id;
}

export async function stavPrepisu(id: string): Promise<StavPrepisu> {
  const r = await fetch(`/api/texty/prepis/${id}`, { headers: hlavicky() });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || 'Stav přepisu se nepodařilo načíst.');
  return d;
}

export {
  slabiky, posledniSlovo, rymovyKlic, rymuje, schemaRymu, najdiRymy, cas,
} from './cestinaTextu';
