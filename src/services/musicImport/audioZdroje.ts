import type { SongAttachment } from '../../types';
import type { LibraryAsset } from '../assetLibraryService';
import { ImportChyba } from './chyby';
import { cistyNazev } from './duplicity';
import type { NahledSkladby } from './normalizace';

/**
 * Odkud se ke skladbě vezme zvuk.
 *
 * spotDL tuhle vrstvu má jako `AudioProvider` a všech šest jeho
 * implementací (YouTube, YouTube Music, Piped, SoundCloud, Bandcamp,
 * slider.kz) dělá totéž: najde nahrávku na cizí streamovací službě a
 * stáhne ji přes `yt-dlp` nebo škrábáním stránky. Tedy přesně to, co se
 * tady dělat nesmí — zvuk, ke kterému uživatel nemá právo.
 *
 * Z spotDL se proto převzalo jen rozhraní: skladba se dá obsloužit,
 * zdroj k ní najde zvuk, zvuk se převezme. Implementace jsou jen dvě a
 * obě pracují s tím, co uživateli patří:
 *
 *   KnihovnaProvider      — soubor, který už leží v jeho knihovně
 *   VlastniSouborProvider — soubor, který sám vybere z disku
 *
 * Třetí zdroj se přidá implementací rozhraní, bez zásahu do zbytku
 * importu. Musí ale platit, že uživatel má k danému zvuku oprávnění —
 * tohle rozhraní nic neověřuje, spoléhá na to, co se do něj zapojí.
 */

export interface NalezZvuku {
  /** Který zdroj ho našel. */
  zdroj: string;
  /** Pro člověka: „Z knihovny: 08. Nomad.mp3". */
  popis: string;
  /** SHA-256 obsahu, pokud je známý ještě před převzetím. */
  checksum?: string;
  /** Položka knihovny, když zvuk už v úložišti leží. */
  asset?: LibraryAsset;
}

export interface AudioSourceProvider {
  readonly id: string;
  readonly nazev: string;
  /** Umí tenhle zdroj se skladbou vůbec něco dělat? Bez dotazu na síť. */
  canHandle(skladba: NahledSkladby): boolean;
  /** Najde oprávněný zvuk. `null`, když žádný není — to není chyba. */
  getMetadata(skladba: NahledSkladby, signal?: AbortSignal): Promise<NalezZvuku | null>;
  /** Převezme zvuk do našeho úložiště (nebo na něj odkáže) a vrátí přílohu písně. */
  download(nalez: NalezZvuku, skladba: NahledSkladby, signal?: AbortSignal): Promise<SongAttachment>;
}

/* ------------------------------------------------------------ Pomocné */

const AUDIO_TYPY = new Set(['audio', 'recording', 'stem']);
const PRIPONA_ZVUKU = /\.(mp3|wav|flac|ogg|oga|m4a|aac|aif|aiff|opus)$/i;

export function jeZvukovyAsset(a: LibraryAsset): boolean {
  return AUDIO_TYPY.has(a.asset_type) || /^audio\//i.test(a.mime_type || '') || PRIPONA_ZVUKU.test(a.name || '');
}

export function jeZvukovySoubor(f: { name: string; type: string }): boolean {
  return /^audio\//i.test(f.type || '') || PRIPONA_ZVUKU.test(f.name || '');
}

/** Slova bez diakritiky a interpunkce — pro porovnání názvů souborů. */
function slova(x: string): string[] {
  return String(x || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Patří soubor ke skladbě?
 *
 * Porovnává se po slovech, ne podřetězcem: „One" od Metallicy nesmí
 * padnout na „Someone.mp3". Stačí jedno z dvojího:
 *
 *   - v názvu souboru jsou všechna slova názvu i interpreta,
 *   - název souboru je po odříznutí čísla stopy přesně název skladby.
 *
 * Druhá cesta je kvůli souborům z alb („08. Nomad.mp3"), které
 * interpreta v názvu nemají.
 */
export function souborPatriKeSkladbe(nazevSouboru: string, skladba: { title: string; artist: string }): boolean {
  const soubor = slova(nazevSouboru.replace(PRIPONA_ZVUKU, ''));
  const nazev = slova(cistyNazev(skladba.title));
  const interpret = slova(skladba.artist);
  if (!nazev.length) return false;

  const mnozina = new Set(soubor);
  const vse = (xs: string[]) => xs.every((x) => mnozina.has(x));
  if (vse(nazev) && interpret.length && vse(interpret)) return true;

  const bezCisla = soubor[0] && /^\d{1,3}$/.test(soubor[0]) ? soubor.slice(1) : soubor;
  return bezCisla.join(' ') === nazev.join(' ');
}

function prilohaZAssetu(a: LibraryAsset): SongAttachment {
  return {
    id: a.id,
    name: a.name,
    type: 'audio',
    dataUrl: '',
    storageBucket: a.storage_bucket,
    storagePath: a.storage_path,
    size: Number(a.size_bytes || 0),
    uploadedAt: Date.now(),
  };
}

function jePreruseni(e: unknown): boolean {
  return !!e && typeof e === 'object' && ((e as any).name === 'AbortError' || (e as any).kod === 'CANCELLED');
}

/** SHA-256 obsahu jako šestnáctkový řetězec. */
export async function sha256(data: Blob): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await data.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------------------------------------------- Z vlastní knihovny */

export interface HledaniVKnihovne {
  hledej(dotaz: string, signal?: AbortSignal): Promise<LibraryAsset[]>;
}

/**
 * Zvuk, který uživatel už má v knihovně.
 *
 * Nic se nekopíruje: píseň dostane odkaz na existující soubor. Dvě kopie
 * téhož zvuku by v úložišti zabíraly místo dvakrát a rozešly by se, kdyby
 * se jedna z nich upravila.
 */
export class KnihovnaProvider implements AudioSourceProvider {
  readonly id = 'knihovna';
  readonly nazev = 'Tvoje knihovna';

  constructor(private readonly knihovna: HledaniVKnihovne) {}

  canHandle(): boolean {
    return true;
  }

  async getMetadata(skladba: NahledSkladby, signal?: AbortSignal): Promise<NalezZvuku | null> {
    const nazev = cistyNazev(skladba.title);
    if (!nazev) return null;
    let vysledky: LibraryAsset[];
    try {
      vysledky = await this.knihovna.hledej(nazev, signal);
    } catch (e) {
      if (jePreruseni(e)) throw new ImportChyba('CANCELLED', 'hledání v knihovně přerušeno');
      // Knihovna nedostupná neznamená, že skladba nejde importovat —
      // jen se k ní zvuk nenajde tady.
      return null;
    }
    const shoda = vysledky.find((a) => jeZvukovyAsset(a) && souborPatriKeSkladbe(a.name, skladba));
    return shoda ? { zdroj: this.id, popis: `Z knihovny: ${shoda.name}`, asset: shoda } : null;
  }

  async download(nalez: NalezZvuku): Promise<SongAttachment> {
    if (!nalez.asset) throw new ImportChyba('DOWNLOAD_FAILED', 'nález z knihovny bez položky');
    return prilohaZAssetu(nalez.asset);
  }
}

/* ------------------------------------------------------- Z vlastního disku */

export interface UlozisteZvuku {
  nahraj(soubor: File, signal?: AbortSignal): Promise<LibraryAsset>;
}

/** Nad tuhle velikost se soubor nepřijme — nahrávka písně se do ní vejde s rezervou. */
export const MAX_VELIKOST_SOUBORU = 300 * 1024 * 1024;

/**
 * Soubor, který uživatel sám vybral z disku.
 *
 * Je jeho — nahrál ho, koupil, nebo vznikl u něj. Nahraje se do knihovny
 * stejnou cestou jako jakýkoli jiný soubor, takže platí stejná pravidla
 * přístupu a v knihovně se najde i mimo tuhle píseň.
 */
export class VlastniSouborProvider implements AudioSourceProvider {
  readonly id = 'vlastni';
  readonly nazev = 'Tvůj soubor';

  constructor(
    private readonly soubory: ReadonlyMap<string, File>,
    private readonly uloziste: UlozisteZvuku,
    private readonly otisk: (f: Blob) => Promise<string> = sha256,
  ) {}

  canHandle(skladba: NahledSkladby): boolean {
    return this.soubory.has(skladba.sourceId);
  }

  async getMetadata(skladba: NahledSkladby): Promise<NalezZvuku | null> {
    const f = this.soubory.get(skladba.sourceId);
    if (!f) return null;
    if (!jeZvukovySoubor(f)) {
      throw new ImportChyba('DOWNLOAD_FAILED', `typ „${f.type}", název „${f.name}"`, 'Vybraný soubor není zvuk.');
    }
    if (f.size > MAX_VELIKOST_SOUBORU) {
      throw new ImportChyba('DOWNLOAD_FAILED', `velikost ${f.size} B`, 'Soubor je větší než 300 MB.');
    }
    if (f.size === 0) throw new ImportChyba('DOWNLOAD_FAILED', 'prázdný soubor', 'Vybraný soubor je prázdný.');
    return { zdroj: this.id, popis: `Tvůj soubor: ${f.name}`, checksum: await this.otisk(f) };
  }

  async download(_nalez: NalezZvuku, skladba: NahledSkladby, signal?: AbortSignal): Promise<SongAttachment> {
    const f = this.soubory.get(skladba.sourceId);
    if (!f) throw new ImportChyba('DOWNLOAD_FAILED', 'soubor zmizel z výběru');
    try {
      return prilohaZAssetu(await this.uloziste.nahraj(f, signal));
    } catch (e) {
      if (jePreruseni(e)) throw new ImportChyba('CANCELLED', 'nahrávání přerušeno');
      throw new ImportChyba('STORAGE_FAILED', e instanceof Error ? e.message : String(e));
    }
  }
}
