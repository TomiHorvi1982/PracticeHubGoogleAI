import { Song } from '../types';

/**
 * Třídění knihovny skladeb.
 *
 * Počítá se v prohlížeči, ne v databázi. Skladby jsou tam už všechny
 * načtené, takže dotaz na server by byl kolo navíc pro data, která máme
 * po ruce — a filtrování by při psaní zadrhávalo. Až knihovna povyroste
 * natolik, že se přestane vyplácet držet ji celou v paměti, přesune se
 * tohle na server; do té doby je to zbytečná složitost.
 */

/** Co všechno k písni existuje. Podle toho se dá filtrovat „co mi chybí". */
export type ObsahKlic = 'text' | 'akordy' | 'tabulatura' | 'noty' | 'video' | 'midi' | 'obrazky';

export const POPIS_OBSAHU: { klic: ObsahKlic; popis: string; ikona: string }[] = [
  { klic: 'text', popis: 'Text', ikona: '📝' },
  { klic: 'akordy', popis: 'Akordy', ikona: '🎸' },
  { klic: 'tabulatura', popis: 'Tabulatura', ikona: '📑' },
  { klic: 'noty', popis: 'Noty', ikona: '🎼' },
  { klic: 'video', popis: 'Video', ikona: '🎥' },
  { klic: 'midi', popis: 'MIDI', ikona: '🎹' },
  { klic: 'obrazky', popis: 'Obrázky', ikona: '🖼️' },
];

/** Přípony, podle kterých se pozná, co příloha obsahuje. */
function typPrilohy(nazev: string): ObsahKlic | null {
  const n = nazev.toLowerCase();
  if (/\.(gp[3-8x]?|ptb|tg)$/.test(n)) return 'tabulatura';
  if (/\.pdf$/.test(n)) return 'noty';
  if (/\.(mid|midi)$/.test(n)) return 'midi';
  if (/\.(png|jpe?g|gif|webp)$/.test(n)) return 'obrazky';
  return null;
}

/** Vrátí, co k písni doopravdy je. */
export function obsahPisne(s: Song): Set<ObsahKlic> {
  const má = new Set<ObsahKlic>();

  if ((s.content || '').trim().length > 40) má.add('text');
  if ((s.chordsUsed?.length || 0) > 0) má.add('akordy');
  if ((s.tabs?.length || 0) > 0) má.add('tabulatura');
  if ((s.sheetMusic?.length || 0) > 0) má.add('noty');
  if ((s.youtubeVideos?.length || 0) > 0) má.add('video');
  if ((s.midiFiles?.length || 0) > 0) má.add('midi');
  if ((s.images?.length || 0) > 0) má.add('obrazky');

  // Přílohy nesou typ, ale u hromadných importů bývá `other`; přípona je
  // spolehlivější, protože ji zapsal ten, kdo soubor pojmenoval.
  for (const p of s.attachments || []) {
    const podleTypu: Partial<Record<string, ObsahKlic>> = {
      guitarpro: 'tabulatura',
      pdf: 'noty',
      midi: 'midi',
      image: 'obrazky',
    };
    const z = typPrilohy(p.name || '') || podleTypu[p.type];
    if (z) má.add(z);
  }
  return má;
}

export interface SongFilter {
  hledani: string;
  pismeno: string | null;
  interpreti: string[];
  toniny: string[];
  ladeni: string[];
  akordy: string[];
  obsahuje: ObsahKlic[];
  /** Skladby, které naopak něco NEmají — na dohledání děr ve zpěvníku. */
  chybi: ObsahKlic[];
  tempoOd: number | null;
  tempoDo: number | null;
}

export const PRAZDNY_FILTR: SongFilter = {
  hledani: '',
  pismeno: null,
  interpreti: [],
  toniny: [],
  ladeni: [],
  akordy: [],
  obsahuje: [],
  chybi: [],
  tempoOd: null,
  tempoDo: null,
};

export function jeFiltrPrazdny(f: SongFilter): boolean {
  return (
    !f.hledani.trim() &&
    !f.pismeno &&
    f.interpreti.length === 0 &&
    f.toniny.length === 0 &&
    f.ladeni.length === 0 &&
    f.akordy.length === 0 &&
    f.obsahuje.length === 0 &&
    f.chybi.length === 0 &&
    f.tempoOd === null &&
    f.tempoDo === null
  );
}

/** Porovnání odolné vůči diakritice — „Nohavica" se má najít i bez háčků. */
function bezDiakritiky(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filtrujSkladby(songs: Song[], f: SongFilter): Song[] {
  const dotaz = bezDiakritiky(f.hledani.trim());

  return songs.filter((s) => {
    if (f.pismeno && !s.title.toUpperCase().startsWith(f.pismeno)) return false;

    if (dotaz) {
      const kupa = bezDiakritiky(
        `${s.title} ${s.artist} ${s.key || ''} ${(s.chordsUsed || []).join(' ')}`
      );
      if (!kupa.includes(dotaz)) return false;
    }

    if (f.interpreti.length && !f.interpreti.includes(s.artist)) return false;
    if (f.toniny.length && !f.toniny.includes(s.key || '')) return false;
    if (f.ladeni.length && !f.ladeni.includes(s.tuning || '')) return false;

    // Akordy: skladba musí obsahovat všechny vybrané, ne jen některý —
    // hledá se „co si zahraju, když umím tyhle".
    if (f.akordy.length) {
      const mé = new Set(s.chordsUsed || []);
      if (!f.akordy.every((a) => mé.has(a))) return false;
    }

    if (f.tempoOd !== null && (s.bpm || 0) < f.tempoOd) return false;
    if (f.tempoDo !== null && (s.bpm || 0) > f.tempoDo) return false;

    if (f.obsahuje.length || f.chybi.length) {
      const má = obsahPisne(s);
      if (!f.obsahuje.every((k) => má.has(k))) return false;
      if (f.chybi.some((k) => má.has(k))) return false;
    }

    return true;
  });
}

export type ZpusobRazeni = 'recent' | 'alphabetical' | 'artist' | 'opened';

const KLIC_OTEVRENI = 'neverlate_naposledy_otevreno';

/** Kdy byla která píseň naposledy otevřená. Drží to prohlížeč — je to
 *  zvyk jednoho člověka na jednom stroji, ne údaj o písni. */
export function nactiOtevreni(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KLIC_OTEVRENI) || '{}');
  } catch {
    return {};
  }
}

export function zaznamenejOtevreni(songId: string): void {
  try {
    const m = nactiOtevreni();
    m[songId] = Date.now();
    localStorage.setItem(KLIC_OTEVRENI, JSON.stringify(m));
  } catch {
    /* plné úložiště nesmí zabránit otevření písně */
  }
}

export function seradSkladby(songs: Song[], zpusob: ZpusobRazeni): Song[] {
  const kopie = [...songs];
  if (zpusob === 'alphabetical') {
    return kopie.sort((a, b) => a.title.localeCompare(b.title, 'cs'));
  }
  if (zpusob === 'artist') {
    return kopie.sort(
      (a, b) => a.artist.localeCompare(b.artist, 'cs') || a.title.localeCompare(b.title, 'cs')
    );
  }
  if (zpusob === 'opened') {
    const kdy = nactiOtevreni();
    // Nikdy neotevřené patří na konec, ne na začátek — jinak by je nula
    // vystrčila před vše ostatní.
    return kopie.sort((a, b) => (kdy[b.id] || 0) - (kdy[a.id] || 0));
  }
  return kopie.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export interface Faseta {
  hodnota: string;
  pocet: number;
}

export interface Fasety {
  interpreti: Faseta[];
  toniny: Faseta[];
  ladeni: Faseta[];
  akordy: Faseta[];
  obsah: { klic: ObsahKlic; pocet: number }[];
  tempo: { min: number; max: number } | null;
}

/**
 * Co všechno se v knihovně vyskytuje a kolikrát.
 *
 * Počítá se z celé knihovny, ne z právě vyfiltrovaného výběru — nabídka,
 * která se pod rukama zmenšuje podle toho, co jsi zrovna zaškrtl, se ovládá
 * mizerně.
 */
export function sestavFasety(songs: Song[]): Fasety {
  const secti = (klice: (s: Song) => string[]) => {
    const m = new Map<string, number>();
    for (const s of songs) for (const k of klice(s)) if (k) m.set(k, (m.get(k) || 0) + 1);
    return [...m.entries()]
      .map(([hodnota, pocet]) => ({ hodnota, pocet }))
      .sort((a, b) => b.pocet - a.pocet || a.hodnota.localeCompare(b.hodnota, 'cs'));
  };

  const tempa = songs.map((s) => s.bpm || 0).filter((b) => b > 0);

  return {
    interpreti: secti((s) => [s.artist]),
    toniny: secti((s) => [s.key || '']),
    ladeni: secti((s) => [s.tuning || '']),
    akordy: secti((s) => s.chordsUsed || []),
    obsah: POPIS_OBSAHU.map(({ klic }) => ({
      klic,
      pocet: songs.filter((s) => obsahPisne(s).has(klic)).length,
    })),
    tempo: tempa.length ? { min: Math.min(...tempa), max: Math.max(...tempa) } : null,
  };
}

const KLIC_FILTRU = 'neverlate_filtr_knihovny';

export function nactiFiltr(): SongFilter {
  try {
    const ulozeny = JSON.parse(localStorage.getItem(KLIC_FILTRU) || 'null');
    // Sloučení s prázdným filtrem: po přidání nového pole by uložený filtr
    // z minula jinak přišel s chybějícím klíčem a filtrování by spadlo.
    return ulozeny ? { ...PRAZDNY_FILTR, ...ulozeny } : { ...PRAZDNY_FILTR };
  } catch {
    return { ...PRAZDNY_FILTR };
  }
}

export function ulozFiltr(f: SongFilter): void {
  try {
    // Hledání se neukládá. Text napsaný před týdnem by při dalším otevření
    // vypadal jako prázdná knihovna.
    localStorage.setItem(KLIC_FILTRU, JSON.stringify({ ...f, hledani: '' }));
  } catch {
    /* plné úložiště nesmí rozbít filtrování */
  }
}
