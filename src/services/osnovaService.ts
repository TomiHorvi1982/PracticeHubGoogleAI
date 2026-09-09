import { supabase } from './supabaseClient';
import { Dovednost, Postup, StavPostupu } from './osnova';

/**
 * Osnova a postup — čtení a zápis.
 *
 * Osnovu čtou všichni přihlášení, mění ji jen učitel. Postup vidí žák
 * i jeho učitel, ale zapisuje ho učitel: „hotovo" je jeho rozhodnutí,
 * a kdyby si to dítě odškrtávalo samo, přestalo by to něco znamenat.
 */

export const osnovaService = {
  async dovednosti(): Promise<Dovednost[]> {
    const { data, error } = await supabase
      .from('dovednosti')
      .select('*')
      .order('stupen', { ascending: true })
      .order('poradi', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as Dovednost[];
  },

  /** Postup jednoho žáka. Bez `zakId` vrátí, na co má přihlášený právo. */
  async postup(zakId?: string): Promise<Postup[]> {
    let dotaz = supabase.from('postup').select('*');
    if (zakId) dotaz = dotaz.eq('zak_id', zakId);
    const { data, error } = await dotaz;
    if (error) throw new Error(error.message);
    return (data || []) as Postup[];
  },

  /**
   * Nastaví stav dovednosti u žáka.
   *
   * Zapisuje se přes `upsert`, protože chybějící řádek znamená nezačato —
   * první kliknutí ho tedy zakládá a další už jen mění.
   */
  async nastav(zakId: string, dovednostId: string, stav: StavPostupu, tempo?: number | null): Promise<void> {
    const { error } = await supabase.from('postup').upsert({
      zak_id: zakId,
      dovednost_id: dovednostId,
      stav,
      tempo: tempo ?? null,
      zmeneno: new Date().toISOString(),
    }, { onConflict: 'zak_id,dovednost_id' });
    if (error) throw new Error(error.message);
  },

  /** Upraví kritérium nebo název dovednosti. Osnova je data, ne kód. */
  async upravDovednost(id: string, zmeny: Partial<Pick<Dovednost, 'nazev' | 'kriterium'>>): Promise<void> {
    const { error } = await supabase
      .from('dovednosti')
      .update({ ...zmeny, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};
