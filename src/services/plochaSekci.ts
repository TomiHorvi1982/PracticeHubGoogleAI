import { MainTabType } from '../components/layout/sekce';
import { PRIME, SKUPINY, STRANOU } from '../components/layout/skupiny';

/**
 * Plocha s ikonami sekcí.
 *
 * Lišta nahoře umí ukázat právě jednu sekci: kdo mixuje a chce vedle
 * tabulaturu, přepíná se tam a zpátky a pokaždé ztratí, co viděl. Plocha
 * je druhá cesta k témuž — ikony jako na tabletu, každá otevře sekci do
 * okna, okna se rozmisťují a rozložení se dá uložit pod jménem.
 *
 * Lišta zůstává. Kdo se v oknech nevyzná, přepne se zpátky a nic se pro
 * něj nemění; kdyby plocha lištu nahradila, byla by to pro celou aplikaci
 * jediná cesta a případná chyba v ní by zavřela všechno.
 *
 * Pódium má vlastní okna (`plovouciOkna.ts`) a zůstávají oddělená
 * schválně: tam jsou okna nad jednou písní a ukládají se k ní, tady jsou
 * to celé sekce a rozložení patří uživateli, ne skladbě.
 */

export interface OknoSekce {
  /** Vlastní identita. Táž sekce může být otevřená jen jednou. */
  id: string;
  sekce: MainTabType;
  x: number;
  y: number;
  sirka: number;
  vyska: number;
  /** Které okno je navrchu. */
  poradi: number;
  sbalene?: boolean;
}

export interface Plocha {
  id: string;
  nazev: string;
  okna: OknoSekce[];
}

export interface Dlazdice {
  id: MainTabType;
  nazev: string;
  ikona: string;
  /** Vlastní barva nástroje — viz `BARVY`. */
  barva: string;
  sirka: number;
  vyska: number;
}

/**
 * Výchozí velikosti oken.
 *
 * Nejsou od oka: pult potřebuje šířku na fadery v jedné řadě, tabulatura
 * výšku na šest strun s notami nad nimi, ladička je čtvereček. Okno, které
 * se otevře moc malé, si každý stejně roztáhne — a to je práce navíc při
 * každém otevření.
 */
const ROZMERY: Partial<Record<MainTabType, [number, number]>> = {
  stemmixer: [1180, 720],
  alphatab: [900, 660],
  texty: [620, 640],
  songbook: [760, 620],
  library: [860, 600],
  playlist: [560, 640],
  podium: [1100, 700],
  practise: [820, 620],
  instruments: [760, 420],
  practice: [520, 460],
  tuner: [420, 380],
  liveamp: [720, 560],
  tone3000: [1100, 720],
  vyuka: [900, 640],
  zalozky: [560, 560],
  settings: [640, 560],
  vitejte: [720, 560],
};

const IKONY: Partial<Record<MainTabType, string>> = {
  songbook: '📚',
  podium: '🎤',
  alphatab: '📑',
  texty: '📝',
  practise: '🏋️',
  instruments: '🎹',
  practice: '🥁',
  tuner: '🎯',
  stemmixer: '🎚️',
  liveamp: '🎸',
  tone3000: '🌐',
  vyuka: '🎓',
  library: '🗂️',
  zalozky: '🔖',
  playlist: '🎬',
  vitejte: '🧭',
  settings: '⚙️',
};

/**
 * Barva nástroje.
 *
 * Každá sekce má svou, a ne pro ozdobu: mezi patnácti stejně šedými
 * dlaždicemi se hledá podle jména, mezi barevnými podle místa a barvy.
 * Po týdnu používání sáhneš po zelené, aniž bys četl.
 *
 * Zlatá tu není schválně — ta patří značce a aktivnímu stavu. Kdyby ji
 * měla i jedna z dlaždic, přestala by aktivní stav odlišovat.
 */
const BARVY: Partial<Record<MainTabType, string>> = {
  songbook: 'info',
  podium: 'chyba',
  alphatab: 'nastroj',
  texty: 'pozor',
  practise: 'uspech',
  instruments: 'info',
  practice: 'pozor',
  tuner: 'uspech',
  stemmixer: 'nastroj',
  liveamp: 'chyba',
  tone3000: 'info',
  vyuka: 'uspech',
  library: 'info',
  zalozky: 'nastroj',
  playlist: 'pozor',
  vitejte: 'uspech',
  settings: 'info',
};

const VYCHOZI_ROZMER: [number, number] = [700, 560];

/**
 * Co se dá na ploše otevřít.
 *
 * Bere se ze stejného seznamu jako horní lišta, takže sekce přidaná do
 * navigace se objeví i tady. Playlist se přidává zvlášť — v liště není,
 * ale je to přesně ten druh okna, které chceš mít otevřené vedle hraní.
 */
export function dlazdice(): Dlazdice[] {
  const zNavigace: { id: MainTabType; nazev: string }[] = [
    ...PRIME.map((p) => ({ id: p.id, nazev: p.nazev })),
    ...SKUPINY.flatMap((s) => s.polozky.filter((p) => !p.jenHlasem).map((p) => ({ id: p.id, nazev: p.nazev }))),
    { id: 'playlist' as MainTabType, nazev: 'Playlist' },
    ...STRANOU,
  ];

  const videne = new Set<MainTabType>();
  return zNavigace
    .filter((p) => (videne.has(p.id) ? false : (videne.add(p.id), true)))
    .map((p) => {
      const [sirka, vyska] = ROZMERY[p.id] || VYCHOZI_ROZMER;
      return {
        id: p.id,
        nazev: p.nazev,
        ikona: IKONY[p.id] || '🎵',
        barva: BARVY[p.id] || 'info',
        sirka,
        vyska,
      };
    });
}

/**
 * Počet oken česky.
 *
 * „1 oken" je hláška napsaná programátorem, ne větou. Skloňování má
 * čeština tři tvary a čtení textu, který je nemá, drhne.
 */
export function pocetOken(n: number): string {
  if (n === 1) return '1 okno';
  if (n >= 2 && n <= 4) return `${n} okna`;
  return `${n} oken`;
}

/** Kam se položí další okno. Schodovitě, ať jde jedno od druhého poznat. */
export function dalsiPozice(okna: OknoSekce[]): { x: number; y: number } {
  const krok = 30;
  const n = okna.length % 8;
  return { x: 32 + n * krok, y: 24 + n * krok };
}

export function noveOkno(sekce: MainTabType, okna: OknoSekce[]): OknoSekce {
  const d = dlazdice().find((x) => x.id === sekce);
  const { x, y } = dalsiPozice(okna);
  return {
    id: `${sekce}-${Date.now().toString(36)}`,
    sekce,
    x,
    y,
    sirka: d?.sirka ?? VYCHOZI_ROZMER[0],
    vyska: d?.vyska ?? VYCHOZI_ROZMER[1],
    poradi: nejvyssiPoradi(okna) + 1,
  };
}

export function nejvyssiPoradi(okna: OknoSekce[]): number {
  return okna.reduce((n, o) => Math.max(n, o.poradi), 0);
}

/**
 * Vytáhne okno dopředu.
 *
 * Pořadí se přečísluje od nuly, jinak by po dni klikání vylezlo do
 * `zIndex` číslo, které přebije i modální okna nad plochou.
 */
export function dopredu(okna: OknoSekce[], id: string): OknoSekce[] {
  if (okna.length < 2) return okna;
  const serazene = [...okna].sort((a, b) => a.poradi - b.poradi);
  const bezNej = serazene.filter((o) => o.id !== id);
  const on = serazene.find((o) => o.id === id);
  if (!on) return okna;
  return [...bezNej, on].map((o, i) => ({ ...o, poradi: i }));
}

/**
 * Otevře sekci, nebo vytáhne dopředu tu, která už otevřená je.
 *
 * Druhé okno téže sekce nedává smysl: sekce si drží svůj stav ve svých
 * komponentách, takže dvě kopie mixážního pultu by se praly o tentýž
 * zvukový řetěz.
 */
export function otevri(okna: OknoSekce[], sekce: MainTabType): OknoSekce[] {
  const uz = okna.find((o) => o.sekce === sekce);
  if (uz) return dopredu(okna, uz.id);
  return [...okna, noveOkno(sekce, okna)];
}

/**
 * Je okno úplně zakryté jiným?
 *
 * Zakryté okno nemá co kreslit. Spektrum, vlnovky a přehrávací kurzory
 * jedou na `requestAnimationFrame`, který prohlížeč uspí jen tehdy, když
 * je celá karta v pozadí — okno schované pod jiným oknem pořád počítá
 * a kreslí do plátna, které nikdo nevidí. Při hraní naživo tahle práce
 * soupeří o procesor se zvukovým vláknem a je slyšet.
 *
 * Počítá se jen zakrytí jedním oknem, ne skládankou z několika. Tři
 * okna, která dohromady zakryjí čtvrté, jsou vzácný případ; kdežto
 * „přes pult jsem si položil tabulaturu" je to, co se děje pořád.
 */
export function zakryte(o: OknoSekce, vsechna: OknoSekce[]): boolean {
  return vsechna.some((j) => (
    j.id !== o.id
    && j.poradi > o.poradi
    && !j.sbalene
    && j.x <= o.x
    && j.y <= o.y
    && j.x + j.sirka >= o.x + o.sirka
    && j.y + j.vyska >= o.y + o.vyska
  ));
}

export function zavri(okna: OknoSekce[], id: string): OknoSekce[] {
  return okna.filter((o) => o.id !== id);
}

/**
 * Srovná okno zpátky do plochy.
 *
 * Uložené rozložení může pocházet z většího monitoru. Bez tohohle by okno
 * po přihlášení na notebooku leželo mimo obrazovku a nešlo by za ně chytit.
 */
export function srovnejOkno(o: OknoSekce, sirkaPlochy: number, vyskaPlochy: number): OknoSekce {
  const sirka = Math.max(260, Math.min(o.sirka, Math.max(260, sirkaPlochy)));
  const vyska = Math.max(140, Math.min(o.vyska, Math.max(140, vyskaPlochy)));
  return {
    ...o,
    sirka,
    vyska,
    x: Math.max(0, Math.min(o.x, Math.max(0, sirkaPlochy - 120))),
    y: Math.max(0, Math.min(o.y, Math.max(0, vyskaPlochy - 40))),
  };
}

/**
 * Rozloží okna do mřížky přes celou plochu.
 *
 * Ruční skládání je práce, kterou nikdo dělat nechce pokaždé. Sloupců se
 * bere odmocnina z počtu oken — tak vyjdou dlaždice nejblíž čtverci a
 * žádné okno není proužek.
 */
export function dlazdicove(okna: OknoSekce[], sirka: number, vyska: number): OknoSekce[] {
  if (!okna.length) return okna;
  const mezera = 8;
  const sloupcu = Math.ceil(Math.sqrt(okna.length));
  const radku = Math.ceil(okna.length / sloupcu);
  const w = Math.floor((sirka - mezera * (sloupcu + 1)) / sloupcu);
  const h = Math.floor((vyska - mezera * (radku + 1)) / radku);
  return okna.map((o, i) => ({
    ...o,
    sbalene: false,
    x: mezera + (i % sloupcu) * (w + mezera),
    y: mezera + Math.floor(i / sloupcu) * (h + mezera),
    sirka: Math.max(260, w),
    vyska: Math.max(140, h),
  }));
}

const KLIC = 'neverlate_plochy';

/**
 * Uložená rozložení.
 *
 * Zatím v prohlížeči, ne v databázi: rozložení je vázané na velikost
 * obrazovky, na které vzniklo, takže přenášet ho mezi počítači by nejspíš
 * škodilo. Tvar je připravený na uložení k účtu, až o to bude stát.
 */
export function prectiPlochy(): Plocha[] {
  try {
    const d = JSON.parse(localStorage.getItem(KLIC) || '[]');
    if (!Array.isArray(d)) return [];
    return d.filter(jePlocha);
  } catch {
    return [];
  }
}

export function ulozPlochy(p: Plocha[]): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(p));
  } catch {
    /* plné úložiště nesmí shodit plochu — rozložení prostě nepřežije */
  }
}

/** Uloží nebo přepíše plochu podle jména. */
export function ulozPlochu(plochy: Plocha[], nazev: string, okna: OknoSekce[]): Plocha[] {
  const jmeno = nazev.trim() || 'Bez názvu';
  const nova: Plocha = { id: `p-${Date.now().toString(36)}`, nazev: jmeno, okna };
  const i = plochy.findIndex((p) => p.nazev.toLowerCase() === jmeno.toLowerCase());
  if (i < 0) return [...plochy, nova];
  const kopie = [...plochy];
  kopie[i] = { ...kopie[i], okna };
  return kopie;
}

function jePlocha(x: any): x is Plocha {
  return !!x && typeof x.nazev === 'string' && Array.isArray(x.okna)
    && x.okna.every((o: any) => o && typeof o.sekce === 'string' && typeof o.x === 'number');
}

const KLIC_AKTUALNI = 'neverlate_plocha_aktualni';

/**
 * Poslední stav plochy.
 *
 * Odděleně od pojmenovaných rozložení: tohle není nic, co by si člověk
 * uložil, jen to, kde přestal. Kdyby se to míchalo mezi uložené plochy,
 * seznam by se plnil sám.
 */
export function prectiAktualni(): OknoSekce[] {
  try {
    const d = JSON.parse(localStorage.getItem(KLIC_AKTUALNI) || '[]');
    return Array.isArray(d) ? d.filter((o: any) => o && typeof o.sekce === 'string') : [];
  } catch {
    return [];
  }
}

export function ulozAktualni(okna: OknoSekce[]): void {
  try {
    localStorage.setItem(KLIC_AKTUALNI, JSON.stringify(okna));
  } catch {
    /* viz ulozPlochy */
  }
}

/* Předpona `neverlate_` je z doby před přejmenováním. Zůstává schválně:
   sjednotit ji na `neverlast_` by znamenalo, že si každý při první
   návštěvě přijde o uložené plochy a rozmístění oken. */
const KLIC_PORADI = 'neverlate_poradi_dlazdic';

/**
 * Vlastní pořadí ikon na ploše.
 *
 * Nabídka chodí ze stejného seznamu jako horní lišta, tedy v pořadí,
 * v jakém sekce vznikaly. Každý ale hraje jinak: kdo cvičí, chce mít
 * vepředu metronom a stupnice; kdo mixuje, pult. Přetažením myší se to
 * srovná a pořadí se pamatuje.
 */
export function presunVPoli<T>(pole: T[], zIndexu: number, naIndex: number): T[] {
  if (zIndexu < 0 || zIndexu >= pole.length) return pole;
  const kopie = [...pole];
  const cil = Math.max(0, Math.min(kopie.length - 1, naIndex));
  const [x] = kopie.splice(zIndexu, 1);
  kopie.splice(cil, 0, x);
  return kopie;
}

/**
 * Seřadí dlaždice podle uloženého pořadí.
 *
 * Uložené pořadí bývá starší než aplikace: sekce mohla přibýt i zmizet.
 * Neznámá jména se proto přeskočí a nově přidané sekce se připojí na
 * konec — přijít o ikonu jen proto, že vznikla později, by znamenalo,
 * že se k té sekci na ploše nedostaneš vůbec.
 */
export function seradDlazdice(vse: Dlazdice[], poradi: string[]): Dlazdice[] {
  const podleId = new Map(vse.map((d) => [String(d.id), d]));
  const serazene: Dlazdice[] = [];
  const pouzite = new Set<string>();
  for (const id of poradi) {
    const d = podleId.get(id);
    if (d && !pouzite.has(id)) { serazene.push(d); pouzite.add(id); }
  }
  for (const d of vse) {
    if (!pouzite.has(String(d.id))) serazene.push(d);
  }
  return serazene;
}

export function prectiPoradiDlazdic(): string[] {
  try {
    const d = JSON.parse(localStorage.getItem(KLIC_PORADI) || '[]');
    return Array.isArray(d) ? d.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function ulozPoradiDlazdic(poradi: string[]): void {
  try {
    localStorage.setItem(KLIC_PORADI, JSON.stringify(poradi));
  } catch {
    /* viz ulozPlochy */
  }
}
