import { supabase } from './supabaseClient';
import { authorizedFetch } from './assetLibraryService';

/**
 * Výuka — žáci a jejich přihlášení.
 *
 * Klientská strana toho, co obsluhuje `server/vyuka.ts`. Přihlášení
 * žáka jde přes server schválně: PIN se ověřuje tam, kde se dá počítat
 * pokusy, a tajemství účtu se do prohlížeče nikdy nedostane.
 */

export interface Zak {
  id: string;
  ucitel_uid: string;
  zak_uid: string;
  prezdivka: string;
  stupen: number;
  /** Sekce studia, které žák uvidí navíc. Prázdné = jen jeho obrazovka. */
  sekce: string[];
  motiv: string;
  poznamka: string;
  aktivni: boolean;
  created_at: string;
}

/**
 * Sekce, které se dají žákovi povolit.
 *
 * Vypsané i tady, protože rozhraní je musí nabídnout. Server má vlastní
 * seznam a rozhoduje on — kdyby se tyhle dva rozešly, projde jen to,
 * co zná server.
 */
export const NABIDKA_SEKCI: { id: string; nazev: string }[] = [
  { id: 'songbook', nazev: 'Knihovna skladeb' },
  { id: 'alphatab', nazev: 'Guitar Pro' },
  { id: 'texty', nazev: 'Texty' },
  { id: 'practise', nazev: 'Cvičení' },
  { id: 'instruments', nazev: 'Virtual Instruments' },
  { id: 'practice', nazev: 'Metronom' },
  { id: 'tuner', nazev: 'Ladička' },
  { id: 'stemmixer', nazev: 'Mixážní pult' },
  { id: 'zalozky', nazev: 'Záložky' },
];

export const MOTIVY: { id: string; nazev: string; pruh: string }[] = [
  { id: 'vesmir', nazev: 'Vesmír', pruh: 'linear-gradient(90deg,#6E5CDE,#E54870)' },
  { id: 'dracek', nazev: 'Dráček', pruh: 'linear-gradient(90deg,#00B878,#0EAEBE)' },
  { id: 'rocker', nazev: 'Rocker', pruh: 'linear-gradient(90deg,#FF9F43,#E54870)' },
  { id: 'studio', nazev: 'Studio', pruh: 'linear-gradient(90deg,#FFD166,#DFA83F)' },
];

/**
 * Odpověď serveru na použitelný tvar.
 *
 * Kontroluje se i to, že přišel JSON. Vývojový server na neznámou cestu
 * vrací stránku aplikace se stavem 200 — bez téhle kontroly by z toho
 * vyšel prázdný objekt, seznam žáků by byl `undefined` a sekce by spadla
 * na `length`. Stalo se to hned napoprvé.
 */
async function odpoved<T>(r: Response): Promise<T> {
  const typ = r.headers.get('content-type') || '';
  const d = typ.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw new Error((d as any)?.error || `Server odpověděl ${r.status}.`);
  if (!d) throw new Error('Server neodpověděl daty — běží s aktuálním kódem?');
  return d as T;
}

export const vyukaService = {
  async seznamZaku(): Promise<Zak[]> {
    const r = await authorizedFetch('/api/vyuka/zaci');
    return (await odpoved<{ zaci: Zak[] }>(r)).zaci || [];
  },

  async zalozZaka(vstup: {
    prezdivka: string; pin: string; stupen?: number; sekce?: string[];
    motiv?: string; poznamka?: string;
  }): Promise<Zak> {
    const r = await authorizedFetch('/api/vyuka/zaci', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vstup),
    });
    return (await odpoved<{ zak: Zak }>(r)).zak;
  },

  async upravZaka(id: string, zmeny: Partial<Zak> & { pin?: string }): Promise<Zak> {
    const r = await authorizedFetch(`/api/vyuka/zaci/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(zmeny),
    });
    return (await odpoved<{ zak: Zak }>(r)).zak;
  },

  async smazZaka(id: string): Promise<void> {
    const r = await authorizedFetch(`/api/vyuka/zaci/${id}`, { method: 'DELETE' });
    await odpoved(r);
  },

  /**
   * Přihlášení žáka přezdívkou a PINem.
   *
   * Server vrátí hotové sezení, které se tady jen nasadí — od té chvíle
   * je žák přihlášený stejně jako kdokoli jiný a všechno ostatní
   * v aplikaci funguje beze změny.
   */
  async prihlasZaka(prezdivka: string, pin: string): Promise<void> {
    const r = await fetch('/api/vyuka/prihlaseni', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prezdivka, pin }),
    });
    const d = await odpoved<{ session: { access_token: string; refresh_token: string } }>(r);
    const { error } = await supabase.auth.setSession(d.session);
    if (error) throw new Error('Přihlášení se nepodařilo dokončit.');
  },

  /** Můj záznam žáka. Učiteli vrátí `null` — žádný nemá. */
  async mujZaznam(): Promise<Zak | null> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: radek } = await supabase
      .from('zaci')
      .select('*')
      .eq('zak_uid', data.user.id)
      .maybeSingle();
    return (radek as Zak) || null;
  },
};
