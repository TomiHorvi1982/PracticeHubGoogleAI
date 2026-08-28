import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Úklid duplicit v knihovně.
 *
 * Bydlí mimo `server.ts`, protože ho spouští dvě cesty: tlačítko pro
 * správce a skript pro hromadný úklid. Kdyby to byly dvě kopie kódu,
 * lišila by se jedna z nich přesně v tom, co se smí smazat.
 */

export interface VysledekUklidu {
  smazano: number;
  uvolneno: number;
  /** Kopie, na kterou ukazuje píseň — ty se nemažou. */
  ponechano: number;
}

export async function uklidDuplicit(
  admin: SupabaseClient,
  smazZUloziste: (bucket: string, key: string) => Promise<void>,
  naSlovo?: (zprava: string) => void,
): Promise<VysledekUklidu> {
  const { data: skupiny, error } = await admin.rpc('duplicitni_soubory');
  if (error) throw new Error(error.message);

  // Přílohy písní si pamatují konkrétní cestu v úložišti, ne otisk obsahu.
  // Smazat kopii, na kterou některá ukazuje, by u písně zbyl mrtvý odkaz —
  // i když je stejný soubor pořád o kus vedle.
  const { data: pisne } = await admin.from('songs').select('metadata').eq('status', 'active');
  const pouzite = JSON.stringify(pisne || []);

  const vysledek: VysledekUklidu = { smazano: 0, uvolneno: 0, ponechano: 0 };

  for (const s of (skupiny || []) as { ids: string[] }[]) {
    const ids = s.ids || [];
    // Nejstarší zůstává — na něj nejspíš ukazují starší odkazy.
    for (const id of ids.slice(1)) {
      const { data: a } = await admin
        .from('assets')
        .select('name, storage_bucket, storage_path, size_bytes')
        .eq('id', id)
        .single();
      if (!a) continue;

      if (pouzite.includes(a.storage_path)) {
        vysledek.ponechano++;
        naSlovo?.(`ponechávám ${a.name} — visí na písni`);
        continue;
      }

      await smazZUloziste(a.storage_bucket, a.storage_path);
      await admin.from('assets').delete().eq('id', id);
      vysledek.smazano++;
      vysledek.uvolneno += Number(a.size_bytes || 0);
      naSlovo?.(`smazáno ${a.name}`);
    }
  }

  return vysledek;
}
