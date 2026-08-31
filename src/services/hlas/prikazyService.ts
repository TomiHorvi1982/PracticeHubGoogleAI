import { supabase } from '../supabaseClient';
import { AKCE, HlasovyPrikaz, Krok, vyhradyKeKroku } from './katalog';

/**
 * Uložené hlasové příkazy.
 *
 * Vedle sebe žijí tři druhy: vestavěné, které umí appka od začátku,
 * osobní, které si člen navázal na svoje fráze, a společné pro celou
 * kapelu. Vestavěné se nikam neukládají — jsou odvozené z katalogu, aby
 * se nemohly rozejít s tím, co appka doopravdy umí.
 */

interface Radek {
  id: string;
  vlastnik: string | null;
  nazev: string;
  fraze: string[];
  kroky: Krok[];
}

/** Příkazy, které fungují bez toho, aby si je kdokoli zakládal. */
export function vestavene(): HlasovyPrikaz[] {
  return AKCE.map((a) => ({
    id: `vestaveny:${a.id}`,
    nazev: a.nazev,
    fraze: a.vychoziFraze,
    kroky: [{ akce: a.id, hodnoty: {} }],
    vlastni: false,
  }));
}

function zRadku(r: Radek): HlasovyPrikaz {
  return { id: r.id, nazev: r.nazev, fraze: r.fraze, kroky: r.kroky, vlastni: true };
}

export const prikazyService = {
  /**
   * Všechno, na co appka slyší.
   *
   * Vlastní příkazy jdou první: kdo si založí vlastní frázi, chce ji mít
   * přednější než vestavěnou, kdyby se obě trefily stejně dobře.
   */
  async nacti(): Promise<HlasovyPrikaz[]> {
    const { data, error } = await supabase
      .from('hlasove_prikazy')
      .select('id, vlastnik, nazev, fraze, kroky')
      .order('vytvoreno', { ascending: true });
    if (error) {
      console.warn('[hlas] Uložené příkazy se nenačetly:', error.message);
      return vestavene();
    }
    return [...(data as Radek[]).map(zRadku), ...vestavene()];
  },

  /**
   * Založí nebo přepíše příkaz.
   *
   * Kroky se kontrolují proti katalogu ještě před uložením — příkaz může
   * vzniknout i překladem volného popisu, a ten se umí odvolat na akci,
   * která neexistuje, nebo poslat tempo mimo rozsah.
   */
  async uloz(prikaz: {
    id?: string;
    nazev: string;
    fraze: string[];
    kroky: Krok[];
    spolecny?: boolean;
  }): Promise<HlasovyPrikaz> {
    const fraze = prikaz.fraze.map((f) => f.trim()).filter(Boolean);
    if (!fraze.length) throw new Error('Příkaz potřebuje aspoň jednu frázi.');
    if (!prikaz.kroky.length) throw new Error('Příkaz potřebuje aspoň jeden krok.');

    const vyhrady = prikaz.kroky.flatMap(vyhradyKeKroku);
    if (vyhrady.length) throw new Error(vyhrady.join(' '));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Pro ukládání příkazů musíš být přihlášený.');

    const radek = {
      ...(prikaz.id ? { id: prikaz.id } : {}),
      vlastnik: prikaz.spolecny ? null : user.id,
      nazev: prikaz.nazev.trim() || 'Příkaz',
      fraze,
      kroky: prikaz.kroky,
      upraveno: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('hlasove_prikazy')
      .upsert(radek)
      .select('id, vlastnik, nazev, fraze, kroky')
      .single();
    if (error) throw new Error(error.message);
    return zRadku(data as Radek);
  },

  async smaz(id: string): Promise<void> {
    const { error } = await supabase.from('hlasove_prikazy').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
