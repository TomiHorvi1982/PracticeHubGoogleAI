import { supabase } from './supabaseClient';
import { Odmena, ZaznamBodu } from './body';
import { Otazka } from './kvizy';

/**
 * Body, odměny a kvízy — čtení a zápis.
 *
 * Připsat si body smí i žák, ale jen kladné a jen se zdrojem: databáze
 * drží jedinečnost na `(zak_id, zdroj)`, takže za tentýž úkol se body
 * nedají dvakrát, ať se tlačítko zmáčkne kolikrát chce. Odečítat smí
 * jedině učitel — výměna se děje na hodině.
 */

export const bodyService = {
  async zaznamy(zakId?: string): Promise<ZaznamBodu[]> {
    let dotaz = supabase.from('body').select('*');
    if (zakId) dotaz = dotaz.eq('zak_id', zakId);
    const { data, error } = await dotaz.order('datum', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as ZaznamBodu[];
  },

  /**
   * Připíše body.
   *
   * Opakované připsání téhož zdroje databáze odmítne a tady se to spolkne:
   * není to chyba, jen se to už jednou stalo.
   */
  async pripis(zakId: string, pocet: number, zaCo: string, zdroj: string): Promise<boolean> {
    const { error } = await supabase.from('body').insert({
      zak_id: zakId, pocet, za_co: zaCo, zdroj,
    });
    if (!error) return true;
    if (error.code === '23505') return false;   // za tohle už body dostal
    throw new Error(error.message);
  },

  /** Výměna. Zapisuje se záporně, aby zůstala v historii. */
  async vymen(zakId: string, odmena: Odmena): Promise<void> {
    const { error } = await supabase.from('body').insert({
      zak_id: zakId,
      pocet: -odmena.cena,
      za_co: 'výměna',
      vymeneno_za: odmena.nazev,
    });
    if (error) throw new Error(error.message);
  },

  async odmeny(): Promise<Odmena[]> {
    const { data, error } = await supabase
      .from('odmeny')
      .select('*')
      .order('cena', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as Odmena[];
  },

  async pridejOdmenu(nazev: string, cena: number): Promise<void> {
    const { data: uzivatel } = await supabase.auth.getUser();
    if (!uzivatel.user) throw new Error('Nejsi přihlášený.');
    const { error } = await supabase.from('odmeny')
      .insert({ ucitel_uid: uzivatel.user.id, nazev, cena });
    if (error) throw new Error(error.message);
  },

  async smazOdmenu(id: string): Promise<void> {
    const { error } = await supabase.from('odmeny').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Psané otázky pro stupeň. Poslech a hmatník si aplikace dělá sama. */
  async psaneOtazky(stupen: number): Promise<Otazka[]> {
    const { data, error } = await supabase
      .from('kvizy')
      .select('*')
      .eq('stupen', stupen);
    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => ({
      id: String(r.id),
      druh: 'vyber' as const,
      text: String(r.otazka),
      moznosti: Array.isArray(r.moznosti) ? r.moznosti.map(String) : [],
      spravne: Number(r.spravne) || 0,
      napoveda: r.napoveda || undefined,
    })).filter((o) => o.moznosti.length >= 2 && o.spravne < o.moznosti.length);
  },

  async ulozVysledek(zakId: string, stupen: number, spravne: number, celkem: number): Promise<string | null> {
    const { data, error } = await supabase.from('vysledky_kvizu')
      .insert({ zak_id: zakId, stupen, spravne, celkem })
      .select('id').single();
    if (error) throw new Error(error.message);
    return data?.id ? String(data.id) : null;
  },

  /** Dny, kdy dítě něco odevzdalo nebo vyplnilo kvíz — na sérii. */
  async dnyAktivity(zakId: string): Promise<string[]> {
    const [ukoly, kvizy] = await Promise.all([
      supabase.from('ukoly').select('odevzdano_kdy').eq('zak_id', zakId).not('odevzdano_kdy', 'is', null),
      supabase.from('vysledky_kvizu').select('datum').eq('zak_id', zakId),
    ]);
    return [
      ...(ukoly.data || []).map((r: any) => String(r.odevzdano_kdy)),
      ...(kvizy.data || []).map((r: any) => String(r.datum)),
    ];
  },
};
