/**
 * Set listy — seznamy skladeb, které se mají hrát.
 *
 * Bydlely ve stavu zpěvníku, takže je nikdo jiný neviděl. Jenže seznam se
 * skládá v knihovně a hraje se z Pódia; dvě sekce, jeden seznam. Odsud ho
 * čtou i zapisují obě a o změně se dozví hned.
 *
 * Pořadí v poli je pořadí, ve kterém se bude hrát. Není to jen seznam
 * skladeb, je to program večera.
 */

const KLIC = 'band_playlists_db';

export interface SetList {
  id: string;
  name: string;
  songIds: string[];
}

const VYCHOZI: SetList[] = [
  { id: 'all', name: 'Vše', songIds: [] },
  { id: 'favorites', name: 'Oblíbené', songIds: [] },
  { id: 'concert', name: 'Koncertní set', songIds: [] },
];

let seznamy: SetList[] = nacti();
const posluchaci = new Set<(s: SetList[]) => void>();

function nacti(): SetList[] {
  try {
    const u = JSON.parse(localStorage.getItem(KLIC) || 'null');
    return Array.isArray(u) && u.length ? u : [...VYCHOZI];
  } catch {
    return [...VYCHOZI];
  }
}

function uloz(): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(seznamy));
  } catch {
    /* plné úložiště nesmí zabránit práci se setem */
  }
  for (const f of posluchaci) f(seznamy);
}

export const setListy = {
  vse(): SetList[] {
    return seznamy;
  },

  /** Sety bez „Vše" — to je filtr knihovny, ne program. */
  hratelne(): SetList[] {
    return seznamy.filter((s) => s.id !== 'all');
  },

  subscribe(f: (s: SetList[]) => void): () => void {
    posluchaci.add(f);
    f(seznamy);
    return () => posluchaci.delete(f);
  },

  nahrad(nove: SetList[]): void {
    seznamy = nove;
    uloz();
  },

  vytvor(nazev: string): SetList {
    const novy = { id: `pl_${Date.now()}`, name: nazev, songIds: [] };
    seznamy = [...seznamy, novy];
    uloz();
    return novy;
  },

  prepni(setId: string, songId: string): void {
    seznamy = seznamy.map((s) =>
      s.id !== setId
        ? s
        : {
            ...s,
            songIds: s.songIds.includes(songId)
              ? s.songIds.filter((x) => x !== songId)
              : [...s.songIds, songId],
          }
    );
    uloz();
  },

  odeber(setId: string, songId: string): void {
    seznamy = seznamy.map((s) =>
      s.id === setId ? { ...s, songIds: s.songIds.filter((x) => x !== songId) } : s
    );
    uloz();
  },

  /**
   * Přesune skladbu na jiné místo v pořadí.
   *
   * Cíl se ořízne do rozsahu, takže posun z kraje ven nic neudělá místo
   * toho, aby skladba zmizela na konec.
   */
  presun(setId: string, zIndexu: number, naIndex: number): void {
    seznamy = seznamy.map((s) => {
      if (s.id !== setId) return s;
      const ids = [...s.songIds];
      if (zIndexu < 0 || zIndexu >= ids.length) return s;
      const cil = Math.max(0, Math.min(ids.length - 1, naIndex));
      const [x] = ids.splice(zIndexu, 1);
      ids.splice(cil, 0, x);
      return { ...s, songIds: ids };
    });
    uloz();
  },
};
