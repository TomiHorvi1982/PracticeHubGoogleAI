import { supabase } from './supabaseClient';
import { authService } from './authService';

/**
 * Odkazy na místa, kam kapela chodí.
 *
 * Dřív bydlely v prohlížeči, takže je viděl jen ten, kdo si je přidal —
 * na jiném počítači byly pryč a vyčištění prohlížeče je smazalo. Jsou to
 * data kapely jako set list, tak jsou v databázi a mění se všem naráz.
 */

export type Kategorie = 'taby' | 'cviceni' | 'teorie' | 'nastroje' | 'vlastni';

export interface Zalozka {
  id: string;
  nazev: string;
  url: string;
  popis: string;
  kategorie: Kategorie;
  poradi: number;
}

export const KATEGORIE: { id: Kategorie; nazev: string; ikona: string }[] = [
  { id: 'taby', nazev: 'Taby a akordy', ikona: '🎸' },
  { id: 'cviceni', nazev: 'Cvičení a kurzy', ikona: '🏋️' },
  { id: 'teorie', nazev: 'Teorie', ikona: '📖' },
  { id: 'nastroje', nazev: 'Nástroje', ikona: '🛠️' },
  { id: 'vlastni', nazev: 'Naše', ikona: '⭐' },
];

type Poslucha = (z: Zalozka[]) => void;

class ZalozkyService {
  private zalozky: Zalozka[] = [];
  private posluchaci = new Set<Poslucha>();
  private kanal: ReturnType<typeof supabase.channel> | null = null;

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.zalozky);
    void this.stahni();
    this.zapniZiveZmeny();
    return () => this.posluchaci.delete(f);
  }

  private oznam() {
    this.posluchaci.forEach((f) => f(this.zalozky));
  }

  private zapniZiveZmeny(): void {
    // Kanál se staví jednou. Zavolat `.on()` na už přihlášeném kanálu
    // vyhodí chybu a kapela by pak neviděla změny vůbec.
    if (this.kanal) return;
    this.kanal = supabase
      .channel('zalozky-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zalozky' }, () => void this.stahni())
      .subscribe();
  }

  public async stahni(): Promise<Zalozka[]> {
    const { data, error } = await supabase
      .from('zalozky')
      .select('*')
      .order('poradi', { ascending: true });
    if (error) {
      console.warn('[zalozky] Načtení selhalo:', error.message);
      return this.zalozky;
    }
    this.zalozky = (data || []).map((r) => ({
      id: r.id,
      nazev: r.nazev,
      url: r.url,
      popis: r.popis || '',
      kategorie: (r.kategorie || 'vlastni') as Kategorie,
      poradi: Number(r.poradi || 0),
    }));
    this.oznam();
    return this.zalozky;
  }

  /**
   * Doplní chybějící `https://`.
   *
   * Kdo píše adresu ručně, protokol vynechá — a odkaz bez něj prohlížeč
   * bere jako cestu na našem serveru a skončí na prázdné stránce.
   */
  private srovnejUrl(url: string): string {
    const u = url.trim();
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
  }

  public async pridej(z: Omit<Zalozka, 'id' | 'poradi'>): Promise<string | null> {
    const nejvyssi = this.zalozky.reduce((m, x) => Math.max(m, x.poradi), 0);
    const { error } = await supabase.from('zalozky').insert({
      nazev: z.nazev.trim(),
      url: this.srovnejUrl(z.url),
      popis: z.popis.trim(),
      kategorie: z.kategorie,
      poradi: nejvyssi + 10,
      vytvoril: authService.getCurrentUser()?.id || null,
    });
    if (error) return error.message;
    await this.stahni();
    return null;
  }

  public async smaz(id: string): Promise<string | null> {
    const { error } = await supabase.from('zalozky').delete().eq('id', id);
    if (error) return error.message;
    await this.stahni();
    return null;
  }

  public async uprav(id: string, zmeny: Partial<Omit<Zalozka, 'id'>>): Promise<string | null> {
    const data: Record<string, unknown> = { ...zmeny };
    if (typeof zmeny.url === 'string') data.url = this.srovnejUrl(zmeny.url);
    const { error } = await supabase.from('zalozky').update(data).eq('id', id);
    if (error) return error.message;
    await this.stahni();
    return null;
  }
}

export const zalozkyService = new ZalozkyService();
