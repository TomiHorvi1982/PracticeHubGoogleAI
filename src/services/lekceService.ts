import { supabase } from './supabaseClient';

/**
 * Lekce — zápis z hodiny.
 *
 * Dvě poznámky schválně: jedna tvoje pracovní, druhá pro rodiče. Do té
 * druhé se nepíše „pořád nedrží ruku", i když do té první ano.
 *
 * Že žák vlastní poznámku učitele nevidí, nehlídá tenhle soubor, ale
 * databáze: pravidla přístupu v Postgresu platí na řádky, ne na sloupce,
 * takže žák čte lekce přes pohled `lekce_pro_zaka`, ve kterém ten sloupec
 * prostě není. Do tabulky samotné nevidí vůbec.
 */

export interface Lekce {
  id: string;
  zak_id: string;
  ucitel_uid?: string;
  datum: string;
  dovednosti: string[];
  poznamka?: string;
  pro_rodice: string;
  created_at?: string;
}

export const lekceService = {
  /** Lekce žáka očima učitele — včetně jeho vlastní poznámky. */
  async proUcitele(zakId: string): Promise<Lekce[]> {
    const { data, error } = await supabase
      .from('lekce')
      .select('*')
      .eq('zak_id', zakId)
      .order('datum', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as Lekce[];
  },

  /** Lekce očima žáka a rodiče. Vlastní poznámka učitele tudy neprojde. */
  async proZaka(): Promise<Lekce[]> {
    const { data, error } = await supabase
      .from('lekce_pro_zaka')
      .select('*')
      .order('datum', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as Lekce[];
  },

  async zapis(vstup: {
    zak_id: string;
    datum: string;
    dovednosti: string[];
    poznamka: string;
    pro_rodice: string;
  }): Promise<Lekce> {
    const { data: uzivatel } = await supabase.auth.getUser();
    if (!uzivatel.user) throw new Error('Nejsi přihlášený.');
    const { data, error } = await supabase.from('lekce')
      .insert({ ...vstup, ucitel_uid: uzivatel.user.id })
      .select().single();
    if (error) throw new Error(error.message);
    return data as Lekce;
  },

  async smaz(id: string): Promise<void> {
    const { error } = await supabase.from('lekce').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
