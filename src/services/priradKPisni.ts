import { Song, SongAttachment } from '../types';
import { LibraryAsset } from './assetLibraryService';
import { klicPisne } from './songDatabaseService';

/**
 * Přiřazení nahraného souboru k písni, která už ve zpěvníku je.
 *
 * Dřív soubor spadl do knihovny a tím to skončilo — píseň o něm nevěděla a
 * člověk ho k ní musel hledat a připojovat ručně. Přitom název souboru
 * obvykle říká, ke které písni patří.
 */

/** Přípony, které nesou jen technický popis a k názvu písně nepatří. */
const BALAST =
  /\b(gp|gp3|gp4|gp5|gpx|pdf|mid|midi|txt|wav|mp3|tab|tabs|chords|akordy|noty|sheet|live|remaster(ed)?|official|hd|4k|final|v\d+|\d{3,4}bpm)\b/gi;

/**
 * Vyloupne z názvu souboru interpreta a název písně.
 *
 * Soubory bývají „Metallica - Nothing Else Matters.gp5", ale taky
 * „02 Territory.gp" nebo „sepultura-roots_bloody_roots_4.gp3". Interpret
 * se proto nemusí podařit najít — název písně stačí, hledá se i podle něj.
 */
export function rozeberNazevSouboru(nazev: string): { interpret: string | null; nazev: string } {
  let t = nazev
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(BALAST, ' ')
    // Pořadové číslo na začátku („02 Territory") i na konci („..._4").
    .replace(/^\s*\d{1,3}[\s.\-)]+/, '')
    .replace(/[\s-]+\d{1,2}\s*$/, '')
    // Po odstranění balastu zbývají prázdné závorky („Pohoda ( )"), které
    // by se počítaly jako slovo a shodu srážely.
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–—]+$/, '')
    .trim();

  const m = t.match(/^(.{2,40}?)\s*[-–—]\s*(.+)$/);
  if (m) return { interpret: m[1].trim(), nazev: m[2].trim() };
  return { interpret: null, nazev: t };
}

/** Shoda podle slov, odolná vůči diakritice a pořadí. */
function shoda(a: string, b: string): number {
  const rozloz = (s: string) =>
    new Set(
      String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((x) => x.length > 1)
    );
  const sa = rozloz(a);
  const sb = rozloz(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let spolecnych = 0;
  for (const x of sa) if (sb.has(x)) spolecnych++;
  return spolecnych / Math.min(sa.size, sb.size);
}

export interface NalezenaPisen {
  song: Song;
  jistota: number;
}

/**
 * Najde píseň, ke které nahraný soubor patří.
 *
 * Přesná shoda interpreta i názvu je jistota; samotný název bez interpreta
 * je slabší, protože stejně pojmenovaných písní je spousta. Pod prahem se
 * radši nevrátí nic — připojit soubor k cizí písni je horší než ho nechat
 * jen v knihovně.
 */
export function najdiPisenProSoubor(nazevSouboru: string, songs: Song[]): NalezenaPisen | null {
  const { interpret, nazev } = rozeberNazevSouboru(nazevSouboru);
  if (nazev.length < 3) return null;

  let nej: NalezenaPisen | null = null;
  for (const s of songs) {
    const shodaNazvu = shoda(nazev, s.title);
    if (shodaNazvu < 0.6) continue;

    // Interpret shodu potvrdí, ale jeho nepřítomnost ji jen oslabí —
    // spousta souborů ho v názvu vůbec nemá.
    const shodaInterpreta = interpret ? shoda(interpret, s.artist) : 0;
    const jistota = interpret
      ? Math.min(1, shodaNazvu * 0.6 + shodaInterpreta * 0.4)
      : shodaNazvu * 0.7;

    if (!nej || jistota > nej.jistota) nej = { song: s, jistota };
  }

  return nej && nej.jistota >= 0.65 ? nej : null;
}

/** Typ přílohy podle přípony — `asset_type` bývá u hromadných nahrávek `other`. */
export function typPrilohy(nazev: string): SongAttachment['type'] {
  const n = nazev.toLowerCase();
  if (/\.(gp[3-8x]?|ptb|tg)$/.test(n)) return 'guitarpro';
  if (n.endsWith('.pdf')) return 'pdf';
  if (/\.midi?$/.test(n)) return 'midi';
  if (/\.(png|jpe?g|gif|webp)$/.test(n)) return 'image';
  if (/\.(wav|mp3|ogg|flac|m4a)$/.test(n)) return 'audio';
  return 'txt';
}

/** Vytvoří z položky knihovny přílohu písně — odkazem, ne kopií bajtů. */
export function prilohaZAssetu(asset: LibraryAsset): SongAttachment {
  return {
    id: asset.id,
    name: asset.name,
    type: typPrilohy(asset.name),
    dataUrl: '',
    storageBucket: asset.storage_bucket,
    storagePath: asset.storage_path,
    size: Number(asset.size_bytes || 0),
    uploadedAt: Date.now(),
  };
}

/** Je soubor u písně už připojený? */
export function jizPripojeno(song: Song, asset: LibraryAsset): boolean {
  return (song.attachments || []).some(
    (a) => a.storagePath === asset.storage_path || (a.name === asset.name && a.id === asset.id)
  );
}

export { klicPisne };
