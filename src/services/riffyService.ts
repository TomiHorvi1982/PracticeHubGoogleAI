import { supabase } from './supabaseClient';
import { Hodnoceni } from './porovnaniHry';

/**
 * Katalog oblíbených riffů a historie pokusů.
 *
 * Riff je výsek nahrávky, ne kopie zvuku: drží se odkaz na položku
 * knihovny a rozsah vteřin. Díky tomu se nic needuplikuje a předloha
 * zůstává tam, kam patří.
 *
 * Pokusy se schraňují všechny. Smysl cvičení je vidět, že se to lepší,
 * a na to je potřeba řada čísel, ne poslední hodnota.
 */

export interface Pokus {
  id: string;
  tony: number;
  rozptylMs: number;
  stredniPosunMs: number;
  nejhorsiCas: number;
  nejhorsiMs: number;
  kdy: string;
}

export interface Riff {
  id: string;
  nazev: string;
  assetId: string | null;
  odVteriny: number;
  doVteriny: number;
  songId?: string | null;
  poznamka?: string | null;
  pokusy: Pokus[];
}

const radekNaRiff = (r: any): Riff => ({
  id: r.id,
  nazev: r.nazev,
  assetId: r.asset_id,
  odVteriny: Number(r.od_vteriny) || 0,
  doVteriny: Number(r.do_vteriny) || 0,
  songId: r.song_id,
  poznamka: r.poznamka,
  pokusy: (r.riff_pokusy || [])
    .map((p: any) => ({
      id: p.id,
      tony: Number(p.tony) || 0,
      rozptylMs: Number(p.rozptyl_ms) || 0,
      stredniPosunMs: Number(p.stredni_posun_ms) || 0,
      nejhorsiCas: Number(p.nejhorsi_cas) || 0,
      nejhorsiMs: Number(p.nejhorsi_ms) || 0,
      kdy: p.kdy,
    }))
    .sort((a: Pokus, b: Pokus) => b.kdy.localeCompare(a.kdy)),
});

export const riffyService = {
  async nacti(): Promise<Riff[]> {
    const { data, error } = await supabase
      .from('riffy')
      .select('*, riff_pokusy(*)')
      .order('upraveno', { ascending: false });
    if (error) {
      console.warn('[riffy] Katalog se nenačetl:', error.message);
      return [];
    }
    return (data || []).map(radekNaRiff);
  },

  async uloz(riff: {
    nazev: string;
    assetId: string | null;
    odVteriny: number;
    doVteriny: number;
    songId?: string | null;
    poznamka?: string | null;
  }): Promise<Riff> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Pro ukládání riffů musíš být přihlášený.');
    if (riff.doVteriny <= riff.odVteriny) throw new Error('Úsek nemá délku.');

    const { data, error } = await supabase
      .from('riffy')
      .insert({
        vlastnik: user.id,
        nazev: riff.nazev.trim() || 'Riff',
        asset_id: riff.assetId,
        od_vteriny: riff.odVteriny,
        do_vteriny: riff.doVteriny,
        song_id: riff.songId ?? null,
        poznamka: riff.poznamka ?? null,
      })
      .select('*, riff_pokusy(*)')
      .single();
    if (error) throw new Error(error.message);
    return radekNaRiff(data);
  },

  async smaz(id: string): Promise<void> {
    const { error } = await supabase.from('riffy').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Zapíše výsledek jednoho pokusu. */
  async ulozPokus(riffId: string, h: Hodnoceni): Promise<Pokus> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Pro ukládání pokusů musíš být přihlášený.');

    const { data, error } = await supabase
      .from('riff_pokusy')
      .insert({
        riff_id: riffId,
        vlastnik: user.id,
        tony: h.tony,
        rozptyl_ms: h.rozptylMs,
        stredni_posun_ms: h.stredniPosunMs,
        nejhorsi_cas: h.nejhorsiCas,
        nejhorsi_ms: h.nejhorsiMs,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Ať katalog řadí podle toho, co se naposledy cvičilo.
    await supabase.from('riffy').update({ upraveno: new Date().toISOString() }).eq('id', riffId);

    return {
      id: data.id,
      tony: Number(data.tony),
      rozptylMs: Number(data.rozptyl_ms),
      stredniPosunMs: Number(data.stredni_posun_ms),
      nejhorsiCas: Number(data.nejhorsi_cas),
      nejhorsiMs: Number(data.nejhorsi_ms),
      kdy: data.kdy,
    };
  },
};

/**
 * Jak si na tom riff stojí.
 *
 * Bere nejlepší pokus, ne poslední: jeden špatný pokus po deseti
 * povedených neznamená, že to člověk neumí. A porovnání s prvním
 * pokusem ukáže postup, což je to, kvůli čemu se historie drží.
 */
export function nejlepsiPokus(pokusy: Pokus[]): Pokus | null {
  if (!pokusy.length) return null;
  // Lepší je vyšší shoda tónů a nižší rozptyl; váha 2:1 ve prospěch tónů,
  // protože zahrát správné tóny je první krok a časování se doladí.
  const skore = (p: Pokus) => p.tony * 2 - Math.min(1, p.rozptylMs / 200);
  return [...pokusy].sort((a, b) => skore(b) - skore(a))[0];
}
