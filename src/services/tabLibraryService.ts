import { supabase } from './supabaseClient';
import { fileUrlService } from './fileUrlService';

/**
 * Vlastní sbírka Guitar Pro tabulatur (tabulka `tab_library`).
 *
 * Sbírka je větší než volný tarif, takže je rozdělená: rejstřík je nahraný
 * celý — proto jde sbírkou listovat i hledat, i když samotné soubory
 * nahrané nejsou — a `storage_path` má jen to, co se opravdu nahrálo.
 * Záznam bez `storage_path` se v seznamu ukáže, ale otevřít nejde.
 *
 * Rejstřík plní `scripts/index-tab-library.ts`.
 */

export interface TabLibraryEntry {
  id: string;
  artist: string;
  title: string;
  format: string;
  relPath: string;
  sizeBytes: number | null;
  /** `true` když je nahraný i soubor, ne jen záznam v rejstříku. */
  stored: boolean;
  storageBucket: string | null;
  storagePath: string | null;
}

function mapRow(r: any): TabLibraryEntry {
  return {
    id: r.id,
    artist: r.artist,
    title: r.title,
    format: r.format,
    relPath: r.rel_path,
    sizeBytes: r.size_bytes,
    stored: r.status === 'stored' && !!r.storage_path,
    storageBucket: r.storage_bucket,
    storagePath: r.storage_path,
  };
}

/** Escapuje `%` a `_`, aby se v ILIKE braly jako znaky, ne jako divoké karty. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const tabLibraryService = {
  /** Kolik toho ve sbírce je — `null` znamená, že se to nepodařilo zjistit. */
  async count(): Promise<{ total: number; stored: number } | null> {
    const [all, stored] = await Promise.all([
      supabase.from('tab_library').select('id', { count: 'exact', head: true }),
      supabase.from('tab_library').select('id', { count: 'exact', head: true }).eq('status', 'stored'),
    ]);
    if (all.error) return null;
    return { total: all.count || 0, stored: stored.count || 0 };
  },

  /** Hledá v interpretovi i názvu zároveň. */
  async search(query: string, limit = 100): Promise<TabLibraryEntry[]> {
    const q = query.trim();
    if (!q) return [];
    const like = `%${escapeLike(q)}%`;
    const { data, error } = await supabase
      .from('tab_library')
      .select('*')
      .or(`artist.ilike.${like},title.ilike.${like}`)
      .order('artist')
      .order('title')
      .limit(limit);
    if (error) {
      console.warn('[tabLibrary] Hledání selhalo:', error.message);
      return [];
    }
    return (data || []).map(mapRow);
  },

  /**
   * Interpreti začínající daným písmenem; `#` vrátí ty, co nezačínají písmenem.
   *
   * Počítá se v databázi. Stahovat řádky a sčítat je tady by nefungovalo —
   * jedno písmeno jich má přes sedm tisíc, takže by se seznam usekl na
   * limitu dotazu a počty by byly tiše špatně.
   */
  async artistsByLetter(letter: string): Promise<{ artist: string; count: number }[]> {
    const { data, error } = await supabase.rpc('tab_library_artists', { letter });
    if (error) {
      console.warn('[tabLibrary] Výpis interpretů selhal:', error.message);
      return [];
    }
    return (data || []).map((r: any) => ({ artist: r.artist, count: Number(r.tab_count) }));
  },

  async byArtist(artist: string): Promise<TabLibraryEntry[]> {
    const { data, error } = await supabase
      .from('tab_library')
      .select('*')
      .eq('artist', artist)
      .order('title')
      .limit(1000);
    if (error) {
      console.warn('[tabLibrary] Výpis skladeb selhal:', error.message);
      return [];
    }
    return (data || []).map(mapRow);
  },

  /**
   * Adresa, ze které jde soubor stáhnout. `null` u záznamů, které jsou
   * zatím jen v rejstříku — volající to musí umět rozlišit a říct proč.
   */
  async fileUrl(entry: TabLibraryEntry): Promise<string | null> {
    if (!entry.stored || !entry.storagePath) return null;
    return fileUrlService.getOne(entry.storageBucket || 'assets', entry.storagePath);
  },
};
