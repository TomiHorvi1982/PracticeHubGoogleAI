import type { ImportMetadata } from '../../types';
import type { DruhZdroje } from './spotifyOdkaz';

/**
 * Z odpovědí Spotify na jednotný tvar skladby.
 *
 * Vychází z toho, jak spotDL skládá `Song` v `Song.from_url` a
 * `Playlist.get_metadata`: bere se největší obal, přeskakují se místní
 * soubory, podcasty a smazané skladby s nulovou délkou. Na rozdíl od
 * spotDL se ale nic nedotahuje zvlášť — spotDL pro každou skladbu volá
 * ještě album a interpreta, tedy tři dotazy na jednu píseň. U playlistu se
 * stovkou skladeb by to bylo tři sta dotazů a limit by nás zastavil dřív.
 * Údaje o albu jsou v odpovědi o skladbě už obsažené.
 *
 * Nic tu nepředpokládá, že pole existuje. Spotify pole odebírá (únor 2026:
 * `popularity`, `label`, na čas i `external_ids`) a rozbitá odpověď nesmí
 * shodit celý import — položka se vynechá a řekne se proč.
 */

export type NahledSkladby = Omit<ImportMetadata, 'importedAt' | 'audioChecksum'> & {
  /** Pořadí v albu nebo playlistu, od jedné. */
  poradi: number;
};

export type DuvodVynechani = 'mistni-soubor' | 'neni-skladba' | 'odstranena' | 'bez-metadat';

export const POPIS_VYNECHANI: Record<DuvodVynechani, string> = {
  'mistni-soubor': 'místní soubory z počítače majitele playlistu',
  'neni-skladba': 'podcasty a jiný obsah než hudba',
  odstranena: 'skladby, které už na Spotify nejsou',
  'bez-metadat': 'položky bez názvu nebo interpreta',
};

export interface NahledKolekce {
  druh: DruhZdroje;
  id: string;
  url: string;
  nazev: string;
  autor: string | null;
  coverUrl: string | null;
  popis: string | null;
  /** Kolik položek Spotify hlásí celkem — může být víc, než kolik se načetlo. */
  celkem: number;
  skladby: NahledSkladby[];
  vynechano: { duvod: DuvodVynechani; pocet: number }[];
  /**
   * Obsah se nedal přečíst.
   *
   * Od února 2026 vydá Spotify skladby playlistu jen jeho majiteli nebo
   * spoluautorovi. U cizího playlistu přijde název a obal, ale seznam ne.
   */
  obsahNedostupny?: boolean;
}

export interface AlbumInterpreta {
  id: string;
  nazev: string;
  rok: string | null;
  coverUrl: string | null;
  pocet: number;
  druh: string;
}

export interface NahledInterpreta {
  id: string;
  url: string;
  nazev: string;
  coverUrl: string | null;
  zanry: string[];
  alba: AlbumInterpreta[];
}

/** Co vrací náhled odkazu — sdílí to server i prohlížeč. */
export type NahledOdpoved =
  | { druh: 'kolekce'; kolekce: NahledKolekce; upozorneni?: { kod: string; zprava: string } }
  | { druh: 'interpret'; interpret: NahledInterpreta };

type Vysledek = { skladba: NahledSkladby } | { vynechano: DuvodVynechani };

interface KontextAlba {
  nazev: string | null;
  interpret: string | null;
  coverUrl: string | null;
  datum: string | null;
}

const text = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const celeCislo = (x: unknown): number | null => (Number.isInteger(x) && (x as number) > 0 ? (x as number) : null);

/**
 * Největší obrázek ze seznamu.
 *
 * Jako ve spotDL podle plochy. Obrázky mozaiky u playlistů nemají rozměry
 * (`width: null`) — ty se počítají jako nula, takže vyhraje první, což je
 * u Spotify ten největší. Bere se jen https: adresa z odpovědi skončí
 * v `<img>` a nic jiného tam nemá co dělat.
 */
export function nejvetsiObal(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const platne = images.filter((i) => i && typeof i.url === 'string' && /^https:\/\//i.test(i.url));
  if (!platne.length) return null;
  const plocha = (i: any) => (Number(i.width) || 0) * (Number(i.height) || 0);
  return platne.reduce((nej, i) => (plocha(i) > plocha(nej) ? i : nej)).url;
}

/** Datum vydání tak, jak ho Spotify zná: rok, měsíc, nebo celé. */
export function platneDatum(x: unknown): string | null {
  const t = text(x);
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(t) ? t : null;
}

/**
 * ISRC v jednotném tvaru.
 *
 * Kód nahrávky, podle kterého se pozná tatáž nahrávka napříč službami.
 * Vzor je z `ISRC_REGEX` ve spotDL. Někde se píše s pomlčkami, proto se
 * před kontrolou odstraní.
 */
export function normalizujIsrc(x: unknown): string | null {
  const t = text(x).toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(t) ? t : null;
}

function externiId(x: unknown): Record<string, string> {
  if (!x || typeof x !== 'object') return {};
  const ven: Record<string, string> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) ven[k] = v.trim();
  }
  return ven;
}

/** Odkaz na skladbu přímo z odpovědi, jinak složený z id. */
function adresaSkladby(raw: any, id: string): string {
  const u = text(raw?.external_urls?.spotify);
  return /^https:\/\/open\.spotify\.com\//.test(u) ? u : `https://open.spotify.com/track/${id}`;
}

/**
 * Jedna skladba.
 *
 * `album` doplní volající u alba: položky z `GET /albums/{id}/tracks` jsou
 * zjednodušené a album v sobě nenesou.
 */
export function normalizujSkladbu(raw: any, poradi: number, album?: KontextAlba): Vysledek {
  if (!raw || typeof raw !== 'object') return { vynechano: 'odstranena' };
  if (raw.is_local) return { vynechano: 'mistni-soubor' };
  if (raw.type && raw.type !== 'track') return { vynechano: 'neni-skladba' };

  const id = text(raw.id);
  const delka = Number(raw.duration_ms) || 0;
  // Nulová délka je u Spotify znamení smazané skladby — spotDL ji vynechává taky.
  if (!id || delka <= 0) return { vynechano: 'odstranena' };

  const nazev = text(raw.name);
  const interpreti = (Array.isArray(raw.artists) ? raw.artists : [])
    .map((a: any) => text(a?.name))
    .filter(Boolean);
  if (!nazev || !interpreti.length) return { vynechano: 'bez-metadat' };

  const alb = raw.album && typeof raw.album === 'object' ? raw.album : null;
  const ids = externiId(raw.external_ids);

  return {
    skladba: {
      source: 'spotify',
      sourceId: id,
      sourceUrl: adresaSkladby(raw, id),
      title: nazev,
      // Hlavní interpret do pole písně, všichni do metadat — stejně jako
      // spotDL (`artist` vs. `artists`). Zpěvník hledá podle jednoho jména.
      artist: interpreti[0],
      artists: interpreti,
      album: text(alb?.name) || album?.nazev || null,
      albumArtist: text(alb?.artists?.[0]?.name) || album?.interpret || null,
      duration: Math.round(delka / 1000),
      releaseDate: platneDatum(alb?.release_date) ?? album?.datum ?? null,
      coverUrl: nejvetsiObal(alb?.images) ?? album?.coverUrl ?? null,
      isrc: normalizujIsrc(ids.isrc),
      externalIds: ids,
      trackNumber: celeCislo(raw.track_number),
      discNumber: celeCislo(raw.disc_number),
      explicit: raw.explicit === true,
      poradi,
    },
  };
}

/** Sečte vynechané položky podle důvodu. */
function sectiVynechane(duvody: DuvodVynechani[]): NahledKolekce['vynechano'] {
  const pocty = new Map<DuvodVynechani, number>();
  for (const d of duvody) pocty.set(d, (pocty.get(d) || 0) + 1);
  return [...pocty].map(([duvod, pocet]) => ({ duvod, pocet }));
}

function zpracuj(polozky: unknown[], vytahni: (x: any) => any, album?: KontextAlba) {
  const skladby: NahledSkladby[] = [];
  const duvody: DuvodVynechani[] = [];
  polozky.forEach((p, i) => {
    const v = normalizujSkladbu(vytahni(p), i + 1, album);
    if ('skladba' in v) skladby.push(v.skladba);
    else duvody.push(v.vynechano);
  });
  return { skladby, vynechano: sectiVynechane(duvody) };
}

/** Popis playlistu smí obsahovat odkazy v HTML; do náhledu jde jen text. */
function holyText(x: unknown): string | null {
  const t = text(x)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
  return t || null;
}

export function kolekceZeSkladby(raw: any): NahledKolekce | null {
  const v = normalizujSkladbu(raw, 1);
  if (!('skladba' in v)) return null;
  const s = v.skladba;
  return {
    druh: 'track', id: s.sourceId, url: s.sourceUrl, nazev: s.title, autor: s.artists.join(', '),
    coverUrl: s.coverUrl, popis: s.album, celkem: 1, skladby: [s], vynechano: [],
  };
}

/**
 * Album.
 *
 * `polozky` jsou všechny stránky `GET /albums/{id}/tracks` za sebou —
 * stránkování řeší poskytovatel, ne normalizace.
 */
export function kolekceZAlba(raw: any, polozky: unknown[]): NahledKolekce {
  const kontext: KontextAlba = {
    nazev: text(raw?.name) || null,
    interpret: text(raw?.artists?.[0]?.name) || null,
    coverUrl: nejvetsiObal(raw?.images),
    datum: platneDatum(raw?.release_date),
  };
  const { skladby, vynechano } = zpracuj(polozky, (x) => x, kontext);
  const id = text(raw?.id);
  return {
    druh: 'album',
    id,
    url: `https://open.spotify.com/album/${id}`,
    nazev: kontext.nazev || 'Album bez názvu',
    autor: (Array.isArray(raw?.artists) ? raw.artists : []).map((a: any) => text(a?.name)).filter(Boolean).join(', ') || null,
    coverUrl: kontext.coverUrl,
    popis: kontext.datum,
    celkem: Number(raw?.total_tracks) || skladby.length,
    skladby,
    vynechano,
  };
}

/**
 * Playlist.
 *
 * `polozky === null` znamená, že Spotify obsah nevydalo (cizí playlist).
 * Položka má skladbu v poli `item`; staré odpovědi ji mají v `track` —
 * spotDL čte obojí a tady taky, aby import nepřestal fungovat, až Spotify
 * staré pole odebere úplně.
 */
export function kolekceZPlaylistu(raw: any, polozky: unknown[] | null): NahledKolekce {
  const id = text(raw?.id);
  const zaklad = {
    druh: 'playlist' as const,
    id,
    url: `https://open.spotify.com/playlist/${id}`,
    nazev: text(raw?.name) || 'Playlist bez názvu',
    autor: text(raw?.owner?.display_name) || null,
    coverUrl: nejvetsiObal(raw?.images),
    popis: holyText(raw?.description),
    // Od února 2026 se pole jmenuje `items`, dřív `tracks`.
    celkem: Number(raw?.items?.total ?? raw?.tracks?.total) || 0,
  };
  if (polozky === null) return { ...zaklad, skladby: [], vynechano: [], obsahNedostupny: true };

  const { skladby, vynechano } = zpracuj(polozky, (p) => {
    if (!p || typeof p !== 'object') return null;
    const item = (p as any).item ?? (p as any).track;
    // `is_local` bývá na položce, ne na skladbě.
    return (p as any).is_local && item ? { ...item, is_local: true } : item;
  });
  return { ...zaklad, celkem: zaklad.celkem || skladby.length, skladby, vynechano };
}

/** Výsledky hledání skladeb jako kolekce, aby je UI ukázalo stejně. */
export function kolekceZHledani(dotaz: string, raw: any): NahledKolekce {
  const polozky = Array.isArray(raw?.tracks?.items) ? raw.tracks.items : [];
  const { skladby, vynechano } = zpracuj(polozky, (x) => x);
  return {
    druh: 'track', id: '', url: '', nazev: `Hledání: ${dotaz}`, autor: null, coverUrl: null,
    popis: null, celkem: skladby.length, skladby, vynechano,
  };
}

/** Interpret a jeho alba — skladby se pak načtou po albech. */
export function interpretSAlby(raw: any, alba: unknown[]): NahledInterpreta {
  const id = text(raw?.id);
  const videna = new Set<string>();
  const seznam: AlbumInterpreta[] = [];
  for (const a of alba) {
    const x = a as any;
    const aid = text(x?.id);
    if (!aid || videna.has(aid)) continue;
    videna.add(aid);
    seznam.push({
      id: aid,
      nazev: text(x?.name) || 'Album bez názvu',
      rok: platneDatum(x?.release_date)?.slice(0, 4) ?? null,
      coverUrl: nejvetsiObal(x?.images),
      pocet: Number(x?.total_tracks) || 0,
      druh: text(x?.album_type) || 'album',
    });
  }
  return {
    id,
    url: `https://open.spotify.com/artist/${id}`,
    nazev: text(raw?.name) || 'Interpret bez jména',
    coverUrl: nejvetsiObal(raw?.images),
    zanry: Array.isArray(raw?.genres) ? raw.genres.map(text).filter(Boolean) : [],
    alba: seznam,
  };
}
