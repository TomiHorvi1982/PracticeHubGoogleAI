import { supabase } from './supabaseClient';
import { authService } from './authService';

/**
 * Uložené riffy a sóla.
 *
 * Riff i sólo jsou totéž — kus nahrávky, tabulatura, smyčka a tempo —
 * takže je drží jedna tabulka a liší je `typ`. Sdílené s kapelou:
 * co si jeden vypilkuje, mají ostatní.
 */

export type TypCviceni = 'riff' | 'solo';

export interface Cviceni {
  id: string;
  nazev: string;
  typ: TypCviceni;
  assetId: string | null;
  tab: string;
  od: number;
  do: number | null;
  bpm: number | null;
  tonina: string | null;
  poznamka: string;
  opakovani: number;
  posledniRychlost: number;
}

type Poslucha = (c: Cviceni[]) => void;

class CviceniService {
  private polozky: Cviceni[] = [];
  private posluchaci = new Set<Poslucha>();
  private kanal: ReturnType<typeof supabase.channel> | null = null;

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.polozky);
    void this.stahni();
    // Kanál se staví jednou; `.on()` na přihlášeném kanálu vyhodí chybu.
    if (!this.kanal) {
      this.kanal = supabase
        .channel('cviceni-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cviceni' }, () => void this.stahni())
        .subscribe();
    }
    return () => this.posluchaci.delete(f);
  }

  private oznam() {
    this.posluchaci.forEach((f) => f(this.polozky));
  }

  public async stahni(): Promise<Cviceni[]> {
    const { data, error } = await supabase
      .from('cviceni')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[cvičení] Načtení selhalo:', error.message);
      return this.polozky;
    }
    this.polozky = (data || []).map((r) => ({
      id: r.id,
      nazev: r.nazev,
      typ: (r.typ || 'riff') as TypCviceni,
      assetId: r.asset_id,
      tab: r.tab || '',
      od: Number(r.od || 0),
      do: r.do === null ? null : Number(r.do),
      bpm: r.bpm === null ? null : Number(r.bpm),
      tonina: r.tonina,
      poznamka: r.poznamka || '',
      opakovani: Number(r.opakovani || 0),
      posledniRychlost: Number(r.posledni_rychlost || 1),
    }));
    this.oznam();
    return this.polozky;
  }

  public async uloz(c: Omit<Cviceni, 'id' | 'opakovani' | 'posledniRychlost'>): Promise<string | null> {
    const { error } = await supabase.from('cviceni').insert({
      nazev: c.nazev.trim(),
      typ: c.typ,
      asset_id: c.assetId,
      tab: c.tab,
      od: c.od,
      do: c.do,
      bpm: c.bpm,
      tonina: c.tonina,
      poznamka: c.poznamka,
      vytvoril: authService.getCurrentUser()?.id || null,
    });
    if (error) return error.message;
    await this.stahni();
    return null;
  }

  public async uprav(id: string, zmeny: Partial<Cviceni>): Promise<string | null> {
    const data: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (zmeny.nazev !== undefined) data.nazev = zmeny.nazev;
    if (zmeny.tab !== undefined) data.tab = zmeny.tab;
    if (zmeny.od !== undefined) data.od = zmeny.od;
    if (zmeny.do !== undefined) data.do = zmeny.do;
    if (zmeny.bpm !== undefined) data.bpm = zmeny.bpm;
    if (zmeny.tonina !== undefined) data.tonina = zmeny.tonina;
    if (zmeny.poznamka !== undefined) data.poznamka = zmeny.poznamka;
    if (zmeny.opakovani !== undefined) data.opakovani = zmeny.opakovani;
    if (zmeny.posledniRychlost !== undefined) data.posledni_rychlost = zmeny.posledniRychlost;

    const { error } = await supabase.from('cviceni').update(data).eq('id', id);
    if (error) return error.message;
    await this.stahni();
    return null;
  }

  /** Zaznamená, že se to zase procvičilo — kvůli přehledu o postupu. */
  public async zapocitej(id: string, rychlost: number): Promise<void> {
    const c = this.polozky.find((x) => x.id === id);
    if (!c) return;
    await this.uprav(id, {
      opakovani: c.opakovani + 1,
      posledniRychlost: rychlost,
    });
  }

  public async smaz(id: string): Promise<string | null> {
    const { error } = await supabase.from('cviceni').delete().eq('id', id);
    if (error) return error.message;
    await this.stahni();
    return null;
  }
}

export const cviceniService = new CviceniService();
