import { supabase } from './supabaseClient';
import { DruhUkolu, Ukol } from './ukoly';

/**
 * Domácí úkoly — čtení a zápis.
 *
 * Co smí žák změnit, hlídá databáze. Pravidla přístupu v Postgresu
 * povolují nebo zakazují celý řádek, ne jednotlivé sloupce — bez
 * spouštěče u tabulky by si dítě mohlo přepsat zadání i vlastní
 * hodnocení.
 */

export const ukolyService = {
  /** Úkoly jednoho žáka. Bez `zakId` vrátí moje vlastní (jsem-li žák). */
  async nacti(zakId?: string): Promise<Ukol[]> {
    let dotaz = supabase.from('ukoly').select('*');
    if (zakId) dotaz = dotaz.eq('zak_id', zakId);
    const { data, error } = await dotaz.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as Ukol[];
  },

  async zadej(vstup: {
    zak_id: string;
    druh: DruhUkolu;
    zadani: string;
    cil_id?: string | null;
    do_kdy?: string | null;
    cilove_tempo?: number | null;
  }): Promise<Ukol> {
    const { data: uzivatel } = await supabase.auth.getUser();
    if (!uzivatel.user) throw new Error('Nejsi přihlášený.');
    const { data, error } = await supabase.from('ukoly').insert({
      ...vstup,
      ucitel_uid: uzivatel.user.id,
      cil_id: vstup.cil_id || null,
      do_kdy: vstup.do_kdy || null,
      cilove_tempo: vstup.cilove_tempo || null,
    }).select().single();
    if (error) throw new Error(error.message);
    return data as Ukol;
  },

  /** Žák odevzdává. Víc než stav mu databáze stejně změnit nedovolí. */
  async odevzdej(id: string): Promise<void> {
    const { error } = await supabase.from('ukoly')
      .update({ stav: 'odevzdano', odevzdano_kdy: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Vrátí úkol zpátky mezi nesplněné — dítě ho odevzdalo omylem. */
  async vratZpet(id: string): Promise<void> {
    const { error } = await supabase.from('ukoly')
      .update({ stav: 'zadano', odevzdano_kdy: null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async ohodnot(id: string, zpetnaVazba: string, hotovo: boolean): Promise<void> {
    const { error } = await supabase.from('ukoly')
      .update({
        zpetna_vazba: zpetnaVazba,
        stav: hotovo ? 'hotovo' : 'zadano',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async smaz(id: string): Promise<void> {
    const { error } = await supabase.from('ukoly').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
