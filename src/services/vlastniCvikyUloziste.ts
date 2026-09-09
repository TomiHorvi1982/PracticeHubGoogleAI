import { Tonu } from './cvikyTechnik';
import { VlastniCvik, jeTon, KLIC, navrhniNazev, prectiCviky } from './vlastniCviky';
import { supabase } from './supabaseClient';

/**
 * Ukládání vlastních cviků.
 *
 * Odděleno od `vlastniCviky.ts` schválně: ten modul je čistý a jde
 * ověřit testem, kdežto tenhle sahá na Supabase, který v testovacím
 * běhu Node neexistuje. Jakmile se obojí smíchá do jednoho souboru,
 * přestanou jít testy spustit — což se taky hned stalo.
 *
 * Do databáze se cviky stěhovaly kvůli domácím úkolům: úkol je cvik,
 * který napsal učitel a otevře ho žák na jiném počítači.
 */

/* ------------------------------------------------------------------
 * Ukládání
 * ------------------------------------------------------------------ */

/** Řádek z databáze na cvik, se kterým pracuje appka. */
function zRadku(r: any): VlastniCvik {
  return {
    id: String(r.id),
    nazev: String(r.nazev || ''),
    tony: Array.isArray(r.tony) ? r.tony.filter(jeTon) : [],
    bpm: Number(r.bpm) || 70,
    zvuk: r.zvuk || undefined,
    ulozeno: new Date(r.updated_at || r.created_at || Date.now()).getTime(),
  };
}

export const cvikyUloziste = {
  async nacti(): Promise<VlastniCvik[]> {
    const { data, error } = await supabase
      .from('vlastni_cviky')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(zRadku);
  },

  /**
   * Uloží cvik, nebo přepíše ten stejnojmenný.
   *
   * Hledá se mezi vlastními, ne mezi vším, co je vidět: žák vidí i cviky
   * svého učitele a shoda jména by mu je zkusila přepsat.
   */
  async uloz(nazev: string, tony: Tonu[], bpm: number, zvuk?: string): Promise<VlastniCvik[]> {
    const { data: uzivatel } = await supabase.auth.getUser();
    if (!uzivatel.user) throw new Error('Nejsi přihlášený.');

    const moje = (await this.nacti()).filter(() => true);
    const jmeno = nazev.trim() || navrhniNazev(moje);
    const stejny = moje.find((c) => c.nazev.toLowerCase() === jmeno.toLowerCase());
    const telo = { nazev: jmeno, tony, bpm, zvuk: zvuk || null, updated_at: new Date().toISOString() };

    const { error } = stejny
      ? await supabase.from('vlastni_cviky').update(telo).eq('id', stejny.id)
      : await supabase.from('vlastni_cviky').insert({ ...telo, autor_uid: uzivatel.user.id });
    if (error) throw new Error(error.message);
    return this.nacti();
  },

  async smaz(id: string): Promise<void> {
    const { error } = await supabase.from('vlastni_cviky').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /**
   * Přenese cviky z prohlížeče do databáze.
   *
   * Jednorázově a jen jednou: klíč se po přenesení přepíše, aby se
   * cviky nezdvojily při každém načtení. Původní data se nemažou —
   * kdyby se přenos nepovedl, pořád jsou kde byla.
   */
  async prenesZProhlizece(): Promise<number> {
    const stare = prectiCviky();
    if (!stare.length) return 0;
    let preneseno = 0;
    for (const c of stare) {
      try {
        await this.uloz(c.nazev, c.tony, c.bpm, c.zvuk);
        preneseno++;
      } catch { /* jeden neúspěch nemá zastavit zbytek */ }
    }
    try {
      localStorage.setItem(`${KLIC}_preneseno`, localStorage.getItem(KLIC) || '[]');
      localStorage.removeItem(KLIC);
    } catch { /* nevadí, jen se přenese znovu */ }
    return preneseno;
  },
};
