import type { ImportMetadata, Song, SongAttachment } from '../../types';
import { ImportChyba, PopisChyby, popisChyby } from './chyby';
import { Shoda, najdiDuplicitu } from './duplicity';
import type { AudioSourceProvider, NalezZvuku } from './audioZdroje';
import type { NahledSkladby } from './normalizace';

/**
 * Průběh importu (AudioImportService).
 *
 * Skladby se zpracují jedna po druhé, ne naráz. Paralelně by to bylo
 * rychlejší, ale zpěvník je sdílený a každé uložení rozešle změnu všem
 * připojeným — deset zápisů najednou by znamenalo deset přepočtů u
 * každého člena kapely. A zrušení uprostřed je u postupného běhu čitelné:
 * co doběhlo, je hotové, zbytek se nezačal.
 *
 * Kroky u jedné skladby:
 *
 *   1. kontrola údajů
 *   2. hledání oprávněného zvuku — jen hledání, zatím se nic nenahrává
 *   3. kontrola duplicity, i podle otisku nalezeného zvuku
 *   4. převzetí zvuku do úložiště
 *   5. uložení písně
 *
 * Duplicita se zjišťuje až po kroku 2 schválně: tentýž soubor připojený
 * k jiné písni se pozná jen podle otisku, a ten je známý až po nalezení.
 * Nahrávat se ale začíná až po kontrole, takže duplicita nic nenahraje.
 *
 * Všechny závislosti přicházejí zvenčí, aby šel průběh ověřit testem bez
 * databáze, úložiště a sítě.
 */

export type StavPolozky = 'ceka' | 'bezi' | 'hotovo' | 'duplicita' | 'chyba' | 'zruseno';

/** Co udělat se skladbou, která ve zpěvníku už je. */
export type Rozhodnuti = 'preskocit' | 'nahradit';

export interface PolozkaImportu {
  skladba: NahledSkladby;
  stav: StavPolozky;
  chyba?: PopisChyby;
  /** Nezávažná potíž — skladba se založila, ale něco chybí (typicky zvuk). */
  upozorneni?: PopisChyby;
  shoda?: Shoda;
  songId?: string;
  /** Popis připojeného zvuku pro člověka. */
  zvuk?: string;
  /**
   * Zvuk, který už je v úložišti.
   *
   * Drží se, aby opakování po chybě databáze nenahrálo tentýž soubor
   * podruhé — v knihovně by pak ležel dvakrát.
   */
  priloha?: SongAttachment;
  checksum?: string;
}

export interface ZavislostiImportu {
  pisne: () => readonly Song[];
  ulozPisen: (song: Song) => Promise<Song>;
  zdroje: readonly AudioSourceProvider[];
  ted?: () => number;
}

export interface MoznostiImportu {
  signal?: AbortSignal;
  /** Založit jen skladby, ke kterým se našel oprávněný zvuk. */
  jenSeZvukem?: boolean;
  rozhodnuti?: Readonly<Record<string, Rozhodnuti>>;
  priZmene?: (polozky: readonly PolozkaImportu[]) => void;
}

export function pripravPolozky(skladby: readonly NahledSkladby[]): PolozkaImportu[] {
  return skladby.map((skladba) => ({ skladba, stav: 'ceka' }));
}

/** Metadata pro uložení — bez pořadí, které patří jen k náhledu. */
export function metadataZNahledu(s: NahledSkladby, ted: number, checksum?: string): ImportMetadata {
  const { poradi: _poradi, ...zbytek } = s;
  return { ...zbytek, importedAt: ted, ...(checksum ? { audioChecksum: checksum } : {}) };
}

export function novaPisen(m: ImportMetadata, priloha: SongAttachment | undefined, ted: number): Song {
  return {
    // Id po vzoru zbytku aplikace; databáze ho nahradí vlastním UUID.
    id: `song_${ted}_${Math.random().toString(36).slice(2, 8)}`,
    title: m.title,
    artist: m.artist,
    key: '',
    content: '',
    chordsUsed: [],
    attachments: priloha ? [priloha] : [],
    obalAlba: m.coverUrl ?? undefined,
    nazevAlba: m.album ?? undefined,
    importMetadata: m,
    createdAt: ted,
    updatedAt: ted,
  };
}

/**
 * „Replace metadata" u existující písně.
 *
 * Mění se jen to, co přišlo z importu: údaje o původu, obal a album.
 * Název, interpret, text a akordy zůstávají — zpěvník má písně přepsané
 * ručně a přepsat „Chci zas v tobě spát" podle toho, jak ji píše Spotify,
 * by zničilo cizí práci.
 */
export function nahradMetadata(
  stavajici: Song,
  m: ImportMetadata,
  priloha: SongAttachment | undefined,
  ted: number,
): Song {
  const prilohy = stavajici.attachments || [];
  const pridat = priloha && !prilohy.some((a) => a.storagePath && a.storagePath === priloha.storagePath);
  return {
    ...stavajici,
    importMetadata: { ...m, audioChecksum: m.audioChecksum ?? stavajici.importMetadata?.audioChecksum },
    obalAlba: m.coverUrl ?? stavajici.obalAlba,
    nazevAlba: m.album ?? stavajici.nazevAlba,
    attachments: pridat ? [...prilohy, priloha!] : prilohy,
    updatedAt: ted,
  };
}

function jako(e: unknown, vychozi: 'DOWNLOAD_FAILED' | 'STORAGE_FAILED'): ImportChyba {
  if (e instanceof ImportChyba) return e;
  if (e && typeof e === 'object' && (e as any).name === 'AbortError') return new ImportChyba('CANCELLED', 'AbortError');
  return new ImportChyba(vychozi, e instanceof Error ? e.message : String(e));
}

const zruseni = (): PopisChyby => popisChyby(new ImportChyba('CANCELLED', 'zrušeno uživatelem'));

async function importujJednu(
  p: PolozkaImportu,
  zav: ZavislostiImportu,
  moz: MoznostiImportu,
): Promise<PolozkaImportu> {
  const s = p.skladba;
  const signal = moz.signal;
  const ted = (zav.ted ?? Date.now)();

  // 1. Údaje, bez kterých se píseň založit nedá.
  if (!s.sourceId || !s.title?.trim() || !s.artist?.trim()) {
    throw new ImportChyba('METADATA_UNAVAILABLE', `id=${s.sourceId || '—'} název=${!!s.title} interpret=${!!s.artist}`);
  }

  // 2. Oprávněný zvuk — jen najít. Při opakování už může být převzatý.
  let nalez: NalezZvuku | null = null;
  let zdroj: AudioSourceProvider | null = null;
  if (!p.priloha) {
    for (const z of zav.zdroje) {
      if (!z.canHandle(s)) continue;
      if (signal?.aborted) return { ...p, stav: 'zruseno', chyba: zruseni() };
      try {
        nalez = await z.getMetadata(s, signal);
      } catch (e) {
        throw jako(e, 'DOWNLOAD_FAILED');
      }
      if (nalez) {
        zdroj = z;
        break;
      }
    }
  }
  const checksum = p.checksum ?? nalez?.checksum;

  // 3. Duplicita. Rozhodnutí „nahradit" z ní udělá aktualizaci.
  const shoda = najdiDuplicitu(
    { sourceId: s.sourceId, isrc: s.isrc, title: s.title, artist: s.artist, audioChecksum: checksum },
    zav.pisne(),
  );
  if (shoda && moz.rozhodnuti?.[s.sourceId] !== 'nahradit') {
    return { ...p, stav: 'duplicita', shoda, checksum, chyba: undefined };
  }

  // 4. Převzetí zvuku.
  let priloha = p.priloha;
  let zvuk = p.zvuk;
  if (!priloha && nalez && zdroj) {
    if (signal?.aborted) return { ...p, stav: 'zruseno', chyba: zruseni(), checksum };
    try {
      priloha = await zdroj.download(nalez, s, signal);
    } catch (e) {
      throw jako(e, 'STORAGE_FAILED');
    }
    zvuk = nalez.popis;
  }

  let upozorneni: PopisChyby | undefined;
  if (!priloha) {
    const bezZvuku = new ImportChyba('AUDIO_SOURCE_UNAVAILABLE', `žádný oprávněný zdroj pro ${s.sourceId}`);
    if (moz.jenSeZvukem) throw bezZvuku;
    upozorneni = popisChyby(bezZvuku);
  }

  // Zrušeno až po převzetí: zvuk už v knihovně je, píseň se nezaloží.
  // Příloha zůstává u položky, takže opakování ji nenahraje znovu.
  if (signal?.aborted) return { ...p, stav: 'zruseno', chyba: zruseni(), priloha, checksum, zvuk };

  // 5. Uložení písně.
  const m = metadataZNahledu(s, ted, checksum);
  const song = shoda ? nahradMetadata(shoda.song, m, priloha, ted) : novaPisen(m, priloha, ted);
  try {
    const ulozena = await zav.ulozPisen(song);
    return { ...p, stav: 'hotovo', songId: ulozena.id, priloha, checksum, zvuk, upozorneni, shoda: shoda ?? undefined, chyba: undefined };
  } catch (e) {
    return {
      ...p,
      stav: 'chyba',
      chyba: popisChyby(new ImportChyba('DATABASE_FAILED', e instanceof Error ? e.message : String(e))),
      priloha,
      checksum,
      zvuk,
    };
  }
}

/** Co se má při běhu zpracovat. Výchozí: všechno, co ještě není vyřízené. */
export type Vyber = (p: PolozkaImportu) => boolean;

const nevyrizene: Vyber = (p) => p.stav !== 'hotovo' && p.stav !== 'duplicita';

export async function importuj(
  polozky: readonly PolozkaImportu[],
  zav: ZavislostiImportu,
  moz: MoznostiImportu = {},
  vyber: Vyber = nevyrizene,
): Promise<PolozkaImportu[]> {
  const stav = polozky.map((p) => ({ ...p }));
  const ohlas = () => moz.priZmene?.(stav.map((p) => ({ ...p })));

  for (let i = 0; i < stav.length; i++) {
    if (!vyber(stav[i])) continue;

    if (moz.signal?.aborted) {
      for (let j = i; j < stav.length; j++) {
        if (vyber(stav[j])) stav[j] = { ...stav[j], stav: 'zruseno', chyba: zruseni() };
      }
      ohlas();
      break;
    }

    stav[i] = { ...stav[i], stav: 'bezi', chyba: undefined, upozorneni: undefined };
    ohlas();
    try {
      stav[i] = await importujJednu(stav[i], zav, moz);
    } catch (e) {
      const c = popisChyby(e, 'DATABASE_FAILED');
      stav[i] = { ...stav[i], stav: c.kod === 'CANCELLED' ? 'zruseno' : 'chyba', chyba: c };
    }
    ohlas();
  }
  return stav;
}

/**
 * Zopakuje, co selhalo nebo se nestihlo.
 *
 * Jen chyby, u kterých opakování může dopadnout jinak. Neplatná metadata
 * nebo chybějící oprávněný zvuk se opakováním nezmění.
 */
export function zopakujNeuspesne(
  polozky: readonly PolozkaImportu[],
  zav: ZavislostiImportu,
  moz: MoznostiImportu = {},
): Promise<PolozkaImportu[]> {
  return importuj(polozky, zav, moz, (p) => p.stav === 'zruseno' || (p.stav === 'chyba' && !!p.chyba?.opakovat));
}

export interface Souhrn {
  celkem: number;
  hotovo: number;
  duplicit: number;
  chyb: number;
  zruseno: number;
  bezZvuku: number;
  zbyva: number;
}

export function souhrn(polozky: readonly PolozkaImportu[]): Souhrn {
  const pocet = (st: StavPolozky) => polozky.filter((p) => p.stav === st).length;
  return {
    celkem: polozky.length,
    hotovo: pocet('hotovo'),
    duplicit: pocet('duplicita'),
    chyb: pocet('chyba'),
    zruseno: pocet('zruseno'),
    bezZvuku: polozky.filter((p) => p.stav === 'hotovo' && p.upozorneni?.kod === 'AUDIO_SOURCE_UNAVAILABLE').length,
    zbyva: pocet('ceka') + pocet('bezi'),
  };
}
