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
  /** Kopie, kterou něco používá — ty se nemažou. */
  ponechano: number;
}

interface Kopie {
  id: string;
  name: string;
  storage_bucket: string;
  storage_path: string;
  size_bytes: number | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Kolik kopií by úklid opravdu smazal.
 *
 * Pouhý počet duplicit by lhal: kopie držená písní nebo bicí sadou
 * zůstane, takže tlačítko „Uklidit" by u ní nedělalo nic a hlásilo by
 * pořád stejné číslo.
 */
export async function spocitejDuplicity(admin: SupabaseClient): Promise<{
  smazatelnych: number;
  bajtuNavic: number;
  chranenych: number;
}> {
  const { data: skupiny, error } = await admin.rpc('duplicitni_soubory');
  if (error) throw new Error(error.message);

  const { data: pisne } = await admin.from('songs').select('metadata').eq('status', 'active');
  const pouzite = JSON.stringify(pisne || []);
  const drzeny = (k: Kopie) =>
    pouzite.includes(k.storage_path) || Boolean(k.metadata && (k.metadata as any).kitId);

  let smazatelnych = 0;
  let bajtuNavic = 0;
  let chranenych = 0;

  for (const s of (skupiny || []) as { ids: string[] }[]) {
    const { data: kopie } = await admin
      .from('assets')
      .select('id, name, storage_bucket, storage_path, size_bytes, metadata')
      .in('id', s.ids || []);
    if (!kopie || kopie.length < 2) continue;

    const serazene = seradKopie(kopie as Kopie[], s.ids || [], drzeny);
    for (const k of serazene.slice(1)) {
      if (drzeny(k)) chranenych++;
      else {
        smazatelnych++;
        bajtuNavic += Number(k.size_bytes || 0);
      }
    }
  }

  return { smazatelnych, bajtuNavic, chranenych };
}

/** Držené kopie dopředu, jinak od nejstarší — maže se až od druhé dál. */
function seradKopie(kopie: Kopie[], poradi: string[], drzeny: (k: Kopie) => boolean): Kopie[] {
  return [...kopie].sort((a, b) => {
    const rozdil = Number(drzeny(b)) - Number(drzeny(a));
    return rozdil !== 0 ? rozdil : poradi.indexOf(a.id) - poradi.indexOf(b.id);
  });
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

  /**
   * Drží tenhle soubor někdo?
   *
   * Kromě písní i bicí sady: vrstva pádu je obyčejný sample, jen má
   * v metadatech `kitId`. Stejný zvuk bývá v knihovně podruhé pod
   * obchodním názvem („Ghosthack Riddim Crash 1.wav" = „crash_left_hard_rr1.wav")
   * a smazat z té dvojice tu kitovou by sadě vzalo pad.
   */
  const drzeny = (k: Kopie) =>
    pouzite.includes(k.storage_path) || Boolean(k.metadata && (k.metadata as any).kitId);

  const vysledek: VysledekUklidu = { smazano: 0, uvolneno: 0, ponechano: 0 };

  for (const s of (skupiny || []) as { ids: string[] }[]) {
    const ids = s.ids || [];
    if (ids.length < 2) continue;

    const { data: kopie } = await admin
      .from('assets')
      .select('id, name, storage_bucket, storage_path, size_bytes, metadata')
      .in('id', ids);
    if (!kopie || kopie.length < 2) continue;

    const serazene = seradKopie(kopie as Kopie[], ids, drzeny);

    for (const k of serazene.slice(1)) {
      if (drzeny(k)) {
        vysledek.ponechano++;
        naSlovo?.(`ponechávám ${k.name} — něco ji používá`);
        continue;
      }
      await smazZUloziste(k.storage_bucket, k.storage_path);
      await admin.from('assets').delete().eq('id', k.id);
      vysledek.smazano++;
      vysledek.uvolneno += Number(k.size_bytes || 0);
      naSlovo?.(`smazáno ${k.name}`);
    }
  }

  return vysledek;
}
