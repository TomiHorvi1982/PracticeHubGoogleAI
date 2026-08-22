import { Song, SongAttachment } from '../../types';

/**
 * Datová smlouva modulů.
 *
 * Do téhle chvíle bylo „co modul potřebuje a odkud si to bere" rozsypané po
 * celém `SongModularWorkspace`: každý modul si přílohy vybíral sám, vlastním
 * `filter`em, a nikde nebylo napsané, co znamená prázdný modul. Kvůli tomu
 * nešlo odpovědět na otázku, na které stojí celá nabídka modulů — ke kterým
 * z nich vlastně data jsou.
 *
 * Tenhle soubor je odpovědí. Každý modul říká, co si vezme, jak pozná, že to
 * má, a co přijme, když mu to chybí.
 */

export type ModulId =
  | 'text_chords'
  | 'youtube'
  | 'chord_diagrams'
  | 'tabs'
  | 'midi'
  | 'notes'
  | 'images'
  | 'links'
  | 'stems_mixer'
  | 'tuner'
  | 'fretboard'
  | 'keyboard';

export interface ModulData {
  /** Má modul co ukázat? Podle tohohle se v nabídce pozná plný od prázdného. */
  jsouData: boolean;
  /** Jednou větou, co v modulu je — text do nabídky modulů. */
  souhrn: string;
  /** Přílohy, které modulu patří. Prázdné u modulů, které přílohy nepoužívají. */
  prilohy: SongAttachment[];
}

export interface ModulSmlouva {
  id: ModulId;
  title: string;
  icon: string;
  popis: string;
  /**
   * Přípony, které modul přijme, když do něj něco přetáhneš. Prázdné znamená,
   * že se do modulu nedá nic vložit — nástroje jako ladička nebo hmatník
   * žádná data písně nepotřebují.
   */
  prijima: string[];
  /** Typ, pod kterým se vložený soubor uloží ke skladbě. */
  typPrilohy?: SongAttachment['type'];
  data: (song: Song) => ModulData;
}

/**
 * Přípona je spolehlivější než `type`.
 *
 * `type` zapisuje ten, kdo soubor nahrál, a u hromadných importů bývá
 * `other`. Příponu naopak zapsal ten, kdo soubor pojmenoval, takže sedí i u
 * dat, která se do appky dostala jinudy. `type` slouží jako záloha.
 */
function prilohyPodle(
  song: Song,
  vzor: RegExp,
  zalozniTypy: SongAttachment['type'][]
): SongAttachment[] {
  return (song.attachments || []).filter(
    (a) => vzor.test((a.name || '').toLowerCase()) || zalozniTypy.includes(a.type)
  );
}

function pocet(n: number, jedna: string, dve: string, vic: string): string {
  if (n === 1) return `1 ${jedna}`;
  if (n < 5) return `${n} ${dve}`;
  return `${n} ${vic}`;
}

/** Modul, který nepracuje s daty písně — je vždy „připravený". */
function nastroj(souhrn: string): (s: Song) => ModulData {
  return () => ({ jsouData: true, souhrn, prilohy: [] });
}

export const REGISTR: ModulSmlouva[] = [
  {
    id: 'text_chords',
    title: 'Text a Akordy',
    icon: '📝',
    popis: 'Text písně s akordy, transpozicí a rolováním',
    prijima: ['.txt', '.chordpro', '.pro', '.crd'],
    typPrilohy: 'txt',
    data: (s) => {
      const delka = (s.content || '').trim().length;
      return {
        jsouData: delka > 40,
        souhrn: delka > 40 ? `${(s.content || '').split('\n').length} řádků` : 'Zatím bez textu',
        prilohy: [],
      };
    },
  },
  {
    id: 'chord_diagrams',
    title: 'Diagramy Akordů',
    icon: '🎸',
    popis: 'Hmatníkové diagramy akordů použitých v písni',
    prijima: [],
    data: (s) => {
      // Akordy se berou i z hranatých závorek v textu — u většiny písní
      // je seznam `chordsUsed` prázdný, ale v textu akordy jsou.
      const zeSeznamu = s.chordsUsed || [];
      const zTextu = [...new Set(
        [...(s.content || '').matchAll(/\[([A-H][^\]]{0,7})\]/g)].map((m) => m[1])
      )];
      const vsechny = zeSeznamu.length ? zeSeznamu : zTextu;
      return {
        jsouData: vsechny.length > 0,
        souhrn: vsechny.length ? vsechny.slice(0, 6).join(' ') : 'Žádné akordy',
        prilohy: [],
      };
    },
  },
  {
    id: 'tabs',
    title: 'Tabs & Tabulatury',
    icon: '📑',
    popis: 'Guitar Pro a textové tabulatury',
    prijima: ['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.gp7', '.gp8', '.ptb', '.tg', '.txt'],
    typPrilohy: 'guitarpro',
    data: (s) => {
      const p = prilohyPodle(s, /\.(gp[3-8x]?|ptb|tg|txt)$/, ['guitarpro', 'txt']);
      return {
        jsouData: p.length > 0 || (s.tabs?.length || 0) > 0,
        souhrn: p.length ? pocet(p.length, 'tabulatura', 'tabulatury', 'tabulatur') : 'Bez tabulatury',
        prilohy: p,
      };
    },
  },
  {
    id: 'notes',
    title: 'Noty',
    icon: '🎼',
    popis: 'Notové zápisy a PDF partitury',
    prijima: ['.pdf'],
    typPrilohy: 'pdf',
    data: (s) => {
      const p = prilohyPodle(s, /\.pdf$/, ['pdf']);
      return {
        jsouData: p.length > 0 || (s.sheetMusic?.length || 0) > 0,
        souhrn: p.length ? pocet(p.length, 'partitura', 'partitury', 'partitur') : 'Bez not',
        prilohy: p,
      };
    },
  },
  {
    id: 'midi',
    title: 'MIDI Přehrávač',
    icon: '🎹',
    popis: 'Přehrávání přiložených MIDI souborů',
    prijima: ['.mid', '.midi'],
    typPrilohy: 'midi',
    data: (s) => {
      const p = prilohyPodle(s, /\.midi?$/, ['midi']);
      return {
        jsouData: p.length > 0 || (s.midiFiles?.length || 0) > 0,
        souhrn: p.length ? pocet(p.length, 'soubor', 'soubory', 'souborů') : 'Bez MIDI',
        prilohy: p,
      };
    },
  },
  {
    id: 'youtube',
    title: 'YouTube Video',
    icon: '🎥',
    popis: 'Klipy, lekce a podklady k písni',
    prijima: [],
    data: (s) => {
      const v = s.youtubeVideos || [];
      return {
        jsouData: v.length > 0,
        souhrn: v.length ? pocet(v.length, 'video', 'videa', 'videí') : 'Bez videa',
        prilohy: [],
      };
    },
  },
  {
    id: 'images',
    title: 'Obrázky',
    icon: '🖼️',
    popis: 'Schémata, poznámky a fotky',
    prijima: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    typPrilohy: 'image',
    data: (s) => {
      const p = prilohyPodle(s, /\.(png|jpe?g|gif|webp)$/, ['image']);
      const celkem = p.length + (s.images?.length || 0);
      return {
        jsouData: celkem > 0,
        souhrn: celkem ? pocet(celkem, 'obrázek', 'obrázky', 'obrázků') : 'Bez obrázků',
        prilohy: p,
      };
    },
  },
  {
    id: 'links',
    title: 'Odkazy',
    icon: '🔗',
    popis: 'Webové odkazy a související materiály',
    prijima: [],
    data: (s) => {
      const o = s.links || [];
      return {
        jsouData: o.length > 0,
        souhrn: o.length ? pocet(o.length, 'odkaz', 'odkazy', 'odkazů') : 'Bez odkazů',
        prilohy: [],
      };
    },
  },
  {
    id: 'stems_mixer',
    title: 'Mixážní pult',
    icon: '🎚️',
    popis: 'Vícestopý mix rozdělených stop',
    prijima: ['.mp3', '.wav'],
    typPrilohy: 'audio',
    data: (s) => {
      const p = prilohyPodle(s, /\.(mp3|wav)$/, ['audio']);
      return {
        jsouData: p.length > 0,
        souhrn: p.length ? pocet(p.length, 'stopa', 'stopy', 'stop') : 'Bez stop',
        prilohy: p,
      };
    },
  },

  // Nástroje. Data písně nepotřebují, takže jsou v nabídce vždycky
  // dostupné — jen se do nich nedá nic vložit.
  { id: 'tuner', title: 'Ladička & Metronom', icon: '🎯', popis: 'Ladička a metronom po ruce', prijima: [], data: nastroj('Vždy k dispozici') },
  { id: 'fretboard', title: 'Hmatník', icon: '🎸', popis: 'Kytarový krk s tóny a pozicemi', prijima: [], data: nastroj('Vždy k dispozici') },
  { id: 'keyboard', title: 'Klavír', icon: '🎹', popis: 'Klaviatura se zvýrazněním tónů', prijima: [], data: nastroj('Vždy k dispozici') },
];

export const REGISTR_PODLE_ID: Record<string, ModulSmlouva> = Object.fromEntries(
  REGISTR.map((m) => [m.id, m])
);

export function dataModulu(song: Song, id: string): ModulData {
  return (
    REGISTR_PODLE_ID[id]?.data(song) ?? { jsouData: false, souhrn: '', prilohy: [] }
  );
}

/** Přijme modul tenhle soubor? */
export function prijimaSoubor(id: string, nazev: string): boolean {
  const pripony = REGISTR_PODLE_ID[id]?.prijima || [];
  const n = nazev.toLowerCase();
  return pripony.some((p) => n.endsWith(p));
}

/** Ke kterým modulům jsou u téhle písně data — podklad pro nabídku modulů. */
export function prehledModulu(song: Song): { smlouva: ModulSmlouva; data: ModulData }[] {
  return REGISTR.map((smlouva) => ({ smlouva, data: smlouva.data(song) }));
}
