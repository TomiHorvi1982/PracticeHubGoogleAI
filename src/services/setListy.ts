import { supabase } from './supabaseClient';
import { authService } from './authService';

/**
 * Set listy — seznamy skladeb, které se mají hrát.
 *
 * Bydlely v prohlížeči, takže program večera viděl jen ten, kdo ho sestavil.
 * Na jiném počítači byl prázdný a bubeník si ho nepřečetl. Teď leží
 * v databázi ve stejných tabulkách, jaké používá spodní přehrávač —
 * `playlists` a `playlist_songs`, kde sloupec `position` drží pořadí.
 *
 * Pořadí v poli je pořadí, ve kterém se bude hrát. Není to jen seznam
 * skladeb, je to program večera.
 */

/** Playlist spodního přehrávače. Ten do set listů nepatří — je to fronta. */
const PREHRAVAC = 'shared-setlist';

/** Přenesení z prohlížeče do databáze proběhne jednou. */
const KLIC_MIGRACE = 'neverlate_setlisty_preneseny';
const STARY_KLIC = 'band_playlists_db';

export interface SetList {
  id: string;
  name: string;
  songIds: string[];
}

let seznamy: SetList[] = [];
let nacteno = false;
const posluchaci = new Set<(s: SetList[]) => void>();
let kanal: ReturnType<typeof supabase.channel> | null = null;

function oznam(): void {
  for (const f of posluchaci) f(seznamy);
}

async function stahni(): Promise<void> {
  const { data: pl, error } = await supabase
    .from('playlists')
    .select('id, name, legacy_id')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[setListy] Sety se nepodařilo načíst:', error.message);
    return;
  }

  const nase = (pl || []).filter((p) => p.legacy_id !== PREHRAVAC);
  if (nase.length === 0) {
    seznamy = [];
    nacteno = true;
    oznam();
    return;
  }

  const { data: polozky } = await supabase
    .from('playlist_songs')
    .select('playlist_id, song_id, position')
    .in('playlist_id', nase.map((p) => p.id))
    .order('position', { ascending: true });

  seznamy = nase.map((p) => ({
    id: p.id,
    name: p.name,
    // Skladby bez `song_id` sem nepatří: do set listu se dává píseň ze
    // zpěvníku, ne holý odkaz na video jako ve frontě přehrávače.
    songIds: (polozky || [])
      .filter((x) => x.playlist_id === p.id && x.song_id)
      .map((x) => x.song_id as string),
  }));
  nacteno = true;
  oznam();
}

/**
 * Přenese sety, které zůstaly v prohlížeči.
 *
 * Proběhne jednou a jen když v databázi ještě žádné nejsou — jinak by
 * druhý člen kapely při prvním otevření naklonoval své staré sety přes ty
 * společné.
 */
async function prenesStare(): Promise<void> {
  try {
    if (localStorage.getItem(KLIC_MIGRACE)) return;
    const stare = JSON.parse(localStorage.getItem(STARY_KLIC) || '[]');
    localStorage.setItem(KLIC_MIGRACE, '1');
    if (!Array.isArray(stare) || seznamy.length > 0) return;

    for (const s of stare) {
      if (s.id === 'all' || !s.name) continue;
      const novy = await setListy.vytvor(s.name);
      if (!novy) continue;
      for (const songId of s.songIds || []) await setListy.prepni(novy.id, songId);
    }
  } catch {
    /* poškozený starý záznam se chová jako žádný */
  }
}

export const setListy = {
  vse(): SetList[] {
    return seznamy;
  },

  /** Sety k hraní. Fronta přehrávače mezi ně nepatří. */
  hratelne(): SetList[] {
    return seznamy;
  },

  subscribe(f: (s: SetList[]) => void): () => void {
    posluchaci.add(f);
    f(seznamy);

    if (!kanal) {
      // Změny od ostatních členů kapely naskočí samy, bez přenačtení.
      kanal = supabase
        .channel('set-listy-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'playlists' }, () => void stahni())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_songs' }, () => void stahni())
        .subscribe();
    }
    if (!nacteno) void stahni().then(prenesStare);

    return () => posluchaci.delete(f);
  },

  async vytvor(nazev: string): Promise<SetList | null> {
    const { data, error } = await supabase
      .from('playlists')
      .insert({ name: nazev, owner_id: authService.getCurrentSession()?.user?.id || null })
      .select('id, name')
      .single();
    if (error || !data) {
      console.warn('[setListy] Set se nepodařilo založit:', error?.message);
      return null;
    }
    const novy = { id: data.id, name: data.name, songIds: [] };
    seznamy = [...seznamy, novy];
    oznam();
    return novy;
  },

  async prepni(setId: string, songId: string): Promise<void> {
    const set = seznamy.find((s) => s.id === setId);
    if (!set) return;
    if (set.songIds.includes(songId)) return setListy.odeber(setId, songId);

    // Zapíše se na konec; pořadí drží `position`, ne pořadí vložení.
    const { error } = await supabase
      .from('playlist_songs')
      .insert({ playlist_id: setId, song_id: songId, position: set.songIds.length });
    if (error) {
      console.warn('[setListy] Skladbu se nepodařilo přidat:', error.message);
      return;
    }
    seznamy = seznamy.map((s) => (s.id === setId ? { ...s, songIds: [...s.songIds, songId] } : s));
    oznam();
  },

  /**
   * Doplní do setu víc skladeb naráz.
   *
   * Na rozdíl od `prepni` jen přidává: přepínač by u hromadného výběru
   * ty už zařazené zase odebral, což nikdo nechce — smysl je „ať jsou
   * v setu všechny tyhle", ne „obrať u každé stav".
   *
   * Vrací, kolik jich doopravdy přibylo.
   */
  async pridejVice(setId: string, songIds: string[]): Promise<number> {
    const set = seznamy.find((s) => s.id === setId);
    if (!set) return 0;

    const chybejici = songIds.filter((id) => !set.songIds.includes(id));
    if (!chybejici.length) return 0;

    const radky = chybejici.map((songId, i) => ({
      playlist_id: setId,
      song_id: songId,
      position: set.songIds.length + i,
    }));

    const { error } = await supabase.from('playlist_songs').insert(radky);
    if (error) {
      console.warn('[setListy] Skladby se nepodařilo přidat:', error.message);
      return 0;
    }

    seznamy = seznamy.map((s) =>
      (s.id === setId ? { ...s, songIds: [...s.songIds, ...chybejici] } : s));
    oznam();
    return chybejici.length;
  },

  async odeber(setId: string, songId: string): Promise<void> {
    const { error } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('playlist_id', setId)
      .eq('song_id', songId);
    if (error) {
      console.warn('[setListy] Skladbu se nepodařilo odebrat:', error.message);
      return;
    }
    const set = seznamy.find((s) => s.id === setId);
    if (set) await srovnejPozice(setId, set.songIds.filter((x) => x !== songId));
  },

  /**
   * Přesune skladbu na jiné místo v pořadí.
   *
   * Cíl se ořízne do rozsahu, takže posun z kraje ven nic neudělá místo
   * toho, aby skladba zmizela na konec.
   */
  async presun(setId: string, zIndexu: number, naIndex: number): Promise<void> {
    const set = seznamy.find((s) => s.id === setId);
    if (!set || zIndexu < 0 || zIndexu >= set.songIds.length) return;
    const ids = [...set.songIds];
    const cil = Math.max(0, Math.min(ids.length - 1, naIndex));
    const [x] = ids.splice(zIndexu, 1);
    ids.splice(cil, 0, x);
    await srovnejPozice(setId, ids);
  },
};

/**
 * Přepíše pořadí celého setu.
 *
 * Zapisuje se všech `position` naráz, ne jen ta přesunutá. Posun jedné
 * skladby mění pozici všem za ní a dopočítávat to po jedné by při dvou
 * otevřených oknech skončilo v pořadí, které nechtěl nikdo.
 */
async function srovnejPozice(setId: string, ids: string[]): Promise<void> {
  // Místní kopie se změní hned, ať se seznam nepřekresluje se zpožděním sítě.
  seznamy = seznamy.map((s) => (s.id === setId ? { ...s, songIds: ids } : s));
  oznam();

  await Promise.all(
    ids.map((songId, i) =>
      supabase
        .from('playlist_songs')
        .update({ position: i })
        .eq('playlist_id', setId)
        .eq('song_id', songId)
    )
  );
}
