/**
 * Cvičení stupnic a kytarových technik — počítaná, ne opsaná.
 *
 * Cvičební materiál na webu je autorská práce a kopírovat ho sem by
 * bylo krádež. Stupnice ale nikomu nepatří: je to fakt o hudbě, stejně
 * jako že kvinta je sedm půltónů. A tradiční technické cviky — chromatika
 * 1-2-3-4, sekvence po třech, pavouk — jsou po generace obecný majetek.
 *
 * Proto se tu nic nestahuje. Cviky se počítají, což dá víc než opsaných
 * pár stránek: každá stupnice v každé poloze, každý vzor v každé
 * tónině, kolik jich kdo chce.
 *
 * Bez závislosti na Web Audiu i na Reactu, aby to šlo ověřit samostatně.
 */

/** Ladění od nejnižší struny; MIDI čísla. E2 A2 D3 G3 B3 E4. */
export const STANDARDNI_LADENI = [40, 45, 50, 55, 59, 64];

export interface Tonu {
  /** Struna 0 = nejnižší (E), 5 = nejvyšší. */
  struna: number;
  /** Pražec; 0 je prázdná struna. */
  prazec: number;
  /** Kterou technikou se na tón jde. */
  technika?: Technika;
}

export type Technika =
  | 'trsatko' | 'hammer' | 'pull' | 'slide' | 'bend' | 'tapping' | 'vibrato';

export const NAZVY_TECHNIK: Record<Technika, string> = {
  trsatko: 'trsátko',
  hammer: 'příklep (hammer-on)',
  pull: 'odtah (pull-off)',
  slide: 'skluz (slide)',
  bend: 'vytažení (bend)',
  tapping: 'ťukání (tapping)',
  vibrato: 'vibrato',
};

/** Značka techniky v textové tabulatuře, mezi předchozím a tímhle tónem. */
export const ZNACKA_TECHNIKY: Record<Technika, string> = {
  trsatko: '-',
  hammer: 'h',
  pull: 'p',
  slide: '/',
  bend: 'b',
  tapping: 't',
  vibrato: '~',
};

/* ------------------------------------------------------- Stupnice */

export interface Stupnice {
  id: string;
  nazev: string;
  /** Půltóny od základního tónu. */
  kroky: number[];
  popis: string;
}

/**
 * Stupnice, na kterých se cvičí.
 *
 * Intervaly jsou fakt, ne něčí text — durová stupnice má krok 2-2-1-2-2-2-1
 * od nepaměti. Vybrané jsou ty, které kytarista potřebuje: dur a moll jako
 * základ, pentatoniky na sóla, blues, a mody, které se v rocku a metalu
 * potkávají nejčastěji.
 */
export const STUPNICE: Stupnice[] = [
  { id: 'dur', nazev: 'Durová (iónská)', kroky: [0, 2, 4, 5, 7, 9, 11], popis: 'Základ všeho. Veselá, jasná.' },
  { id: 'moll', nazev: 'Přirozená moll (aiolská)', kroky: [0, 2, 3, 5, 7, 8, 10], popis: 'Smutná sestra dur. Půlka rocku stojí na ní.' },
  { id: 'pentatonika_moll', nazev: 'Mollová pentatonika', kroky: [0, 3, 5, 7, 10], popis: 'Pět tónů, ze kterých je většina rockových sól.' },
  { id: 'pentatonika_dur', nazev: 'Durová pentatonika', kroky: [0, 2, 4, 7, 9], popis: 'Otevřenější sestra mollové. Country, southern rock.' },
  { id: 'blues', nazev: 'Bluesová', kroky: [0, 3, 5, 6, 7, 10], popis: 'Pentatonika s blue notou — tou, co za to může.' },
  { id: 'dorska', nazev: 'Dórská', kroky: [0, 2, 3, 5, 7, 9, 10], popis: 'Moll s veselou sextou. Santana, jazzrock.' },
  { id: 'frygicka', nazev: 'Frygická', kroky: [0, 1, 3, 5, 7, 8, 10], popis: 'Půltón hned na začátku — španělsky a temně.' },
  { id: 'frygicka_dur', nazev: 'Frygická dur', kroky: [0, 1, 4, 5, 7, 8, 10], popis: 'Ta z metalu i z flamenka. Zvětšená sekunda uvnitř.' },
  { id: 'lydicka', nazev: 'Lydická', kroky: [0, 2, 4, 6, 7, 9, 11], popis: 'Dur se zvětšenou kvartou. Filmově, snově.' },
  { id: 'mixolydicka', nazev: 'Mixolydická', kroky: [0, 2, 4, 5, 7, 9, 10], popis: 'Dur se sníženou septimou. Blues rock.' },
  { id: 'harmonicka_moll', nazev: 'Harmonická moll', kroky: [0, 2, 3, 5, 7, 8, 11], popis: 'Moll s velkou septimou. Neoklasika, Malmsteen.' },
  { id: 'celotonova', nazev: 'Celotónová', kroky: [0, 2, 4, 6, 8, 10], popis: 'Samé celé tóny — nemá kde skončit.' },
];

export const TONY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];

/** Jméno tónu z MIDI čísla. */
export function nazevTonu(midi: number): string {
  return TONY[((midi % 12) + 12) % 12];
}

/** MIDI číslo tónu na daném pražci. */
export function midiNaPrazci(struna: number, prazec: number, ladeni = STANDARDNI_LADENI): number {
  return (ladeni[struna] ?? 0) + prazec;
}

/**
 * Stupnice v jedné poloze na hmatníku.
 *
 * Prochází struny odspodu nahoru a na každé bere tóny, které do
 * stupnice patří a leží v okně čtyř pražců od výchozí polohy. Tak se
 * hraje doopravdy: ruka stojí a nešmatrá po celém krku.
 *
 * `zaklad` je MIDI základního tónu (např. 40 = E2), `poloha` první
 * pražec okna.
 */
export function stupniceVPoloze(
  zaklad: number,
  kroky: number[],
  poloha: number,
  ladeni = STANDARDNI_LADENI,
  sirkaOkna = 4,
): Tonu[] {
  const tridy = new Set(kroky.map((k) => ((zaklad + k) % 12 + 12) % 12));
  const ven: Tonu[] = [];
  for (let struna = 0; struna < ladeni.length; struna++) {
    for (let p = poloha; p <= poloha + sirkaOkna; p++) {
      if (p < 0 || p > 24) continue;
      if (tridy.has(((midiNaPrazci(struna, p, ladeni) % 12) + 12) % 12)) {
        ven.push({ struna, prazec: p });
      }
    }
  }
  return ven;
}

/**
 * Kde na krku stupnice začíná.
 *
 * Vrátí pražce, na kterých leží základní tón na nejnižší struně —
 * z toho se dělají polohy, ve kterých se stupnice cvičí.
 */
export function polohyStupnice(zaklad: number, ladeni = STANDARDNI_LADENI): number[] {
  const ven: number[] = [];
  const trida = ((zaklad % 12) + 12) % 12;
  for (let p = 0; p <= 12; p++) {
    if (((midiNaPrazci(0, p, ladeni) % 12) + 12) % 12 === trida) ven.push(p);
  }
  return ven;
}

/* ------------------------------------------------- Sekvence a vzory */

export type Sekvence = 'rovne' | 'po3' | 'po4' | 'tercie' | 'nahoruDolu';

export const NAZVY_SEKVENCI: Record<Sekvence, string> = {
  rovne: 'Rovně nahoru a dolů',
  po3: 'Po třech (1-2-3, 2-3-4…)',
  po4: 'Po čtyřech (1-2-3-4, 2-3-4-5…)',
  tercie: 'V terciích (1-3, 2-4…)',
  nahoruDolu: 'Nahoru a hned dolů',
};

/**
 * Přerovná tóny podle cvičební sekvence.
 *
 * Stupnice nahoru a dolů je jen rozehřátí; teprve sekvence z ní udělá
 * cvik, protože ruka nesmí jet po paměti.
 */
export function poSekvenci(tony: Tonu[], sekvence: Sekvence): Tonu[] {
  const n = tony.length;
  if (n === 0) return [];
  switch (sekvence) {
    case 'rovne':
      return [...tony, ...tony.slice(0, -1).reverse()];
    case 'po3': {
      const ven: Tonu[] = [];
      for (let i = 0; i + 2 < n; i++) ven.push(tony[i], tony[i + 1], tony[i + 2]);
      return ven;
    }
    case 'po4': {
      const ven: Tonu[] = [];
      for (let i = 0; i + 3 < n; i++) ven.push(tony[i], tony[i + 1], tony[i + 2], tony[i + 3]);
      return ven;
    }
    case 'tercie': {
      const ven: Tonu[] = [];
      for (let i = 0; i + 2 < n; i++) ven.push(tony[i], tony[i + 2]);
      return ven;
    }
    case 'nahoruDolu': {
      const ven: Tonu[] = [];
      for (let i = 0; i + 1 < n; i++) ven.push(tony[i], tony[i + 1], tony[i]);
      return ven;
    }
    default:
      return tony;
  }
}

/* --------------------------------------------- Textová tabulatura */

/**
 * Vysází tóny do textové tabulatury.
 *
 * Šest řádků odshora od nejvyšší struny, jak se tabulatura píše.
 * Značka techniky sedí před tónem, ke kterému patří — příklep se
 * zapisuje mezi tóny, ne na ně.
 */
export function naTabulaturu(tony: Tonu[], ladeni = STANDARDNI_LADENI): string {
  const jmena = ['E', 'A', 'D', 'G', 'H', 'e'];
  const radky: string[][] = ladeni.map(() => []);

  for (const t of tony) {
    const text = String(t.prazec);
    const spojka = t.technika && t.technika !== 'trsatko' ? ZNACKA_TECHNIKY[t.technika] : '-';
    for (let s = 0; s < radky.length; s++) {
      if (s === t.struna) radky[s].push(spojka + text);
      else radky[s].push('-'.repeat(text.length + 1));
    }
  }

  // Odshora nejvyšší struna: pole má nejnižší na indexu 0.
  return radky
    .map((r, i) => `${jmena[i]}|${r.join('') || '-'}-|`)
    .reverse()
    .join('\n');
}

/* --------------------------------------------------- Cviky technik */

export interface CvikTechniky {
  id: string;
  nazev: string;
  technika: Technika;
  popis: string;
  /** Co si hlídat — jedna věta. */
  pozor: string;
  bpmOd: number;
  bpmDo: number;
  tony: Tonu[];
}

/**
 * Tradiční cviky na jednotlivé techniky.
 *
 * Vzory jsou obecný majetek — chromatiku 1-2-3-4 učí každý učitel na
 * světě a nikdo si ji nevymyslel. Počítají se z pražce, aby šly posunout
 * po krku, kam je potřeba.
 */
export function cvikyTechnik(poloha = 5): CvikTechniky[] {
  const p = Math.max(1, Math.min(18, poloha));
  const chromatika: Tonu[] = [];
  for (let s = 0; s < 6; s++) {
    for (let i = 0; i < 4; i++) chromatika.push({ struna: s, prazec: p + i });
  }

  const prikepy: Tonu[] = [];
  for (let s = 5; s >= 0; s--) {
    prikepy.push({ struna: s, prazec: p });
    prikepy.push({ struna: s, prazec: p + 2, technika: 'hammer' });
    prikepy.push({ struna: s, prazec: p, technika: 'pull' });
  }

  const legato: Tonu[] = [];
  for (let s = 5; s >= 0; s--) {
    legato.push({ struna: s, prazec: p });
    legato.push({ struna: s, prazec: p + 2, technika: 'hammer' });
    legato.push({ struna: s, prazec: p + 4, technika: 'hammer' });
    legato.push({ struna: s, prazec: p + 2, technika: 'pull' });
  }

  return [
    {
      id: 'chromatika',
      nazev: 'Chromatika 1-2-3-4',
      technika: 'trsatko',
      popis: 'Čtyři prsty na čtyřech pražcích, struna po struně nahoru a zpátky.',
      pozor: 'Každý prst zůstane dole, dokud nezahraje další — nezvedat je dopředu.',
      bpmOd: 60, bpmDo: 200,
      tony: [...chromatika, ...chromatika.slice(0, -1).reverse()],
    },
    {
      id: 'hammer_pull',
      nazev: 'Příklep a odtah',
      technika: 'hammer',
      popis: 'Trsátko jen na první tón, zbytek udělá levá ruka.',
      pozor: 'Odtah je tah do strany, ne zvednutí prstu — jinak není slyšet.',
      bpmOd: 50, bpmDo: 170,
      tony: prikepy,
    },
    {
      id: 'legato',
      nazev: 'Legato po třech',
      technika: 'hammer',
      popis: 'Tři tóny na strunu jedním trsnutím. Základ plynulého sóla.',
      pozor: 'Hlasitost všech tří stejná — třetí bývá slabý.',
      bpmOd: 50, bpmDo: 160,
      tony: legato,
    },
    {
      id: 'slide',
      nazev: 'Skluzy po krku',
      technika: 'slide',
      popis: 'Skluz o dva a o čtyři pražce, tam i zpátky.',
      pozor: 'Tlak drží po celou cestu, jinak tón cestou zhasne.',
      bpmOd: 50, bpmDo: 140,
      tony: [
        { struna: 2, prazec: p }, { struna: 2, prazec: p + 2, technika: 'slide' },
        { struna: 2, prazec: p, technika: 'slide' }, { struna: 2, prazec: p + 4, technika: 'slide' },
        { struna: 3, prazec: p }, { struna: 3, prazec: p + 2, technika: 'slide' },
        { struna: 3, prazec: p, technika: 'slide' }, { struna: 3, prazec: p + 4, technika: 'slide' },
      ],
    },
    {
      id: 'bend',
      nazev: 'Vytažení o celý tón',
      technika: 'bend',
      popis: 'Vytáhnout, porovnat s cílovým tónem, vrátit.',
      pozor: 'Tlačí zápěstí, ne prst. Cílový tón si napřed zahraj, ať víš, kam míříš.',
      bpmOd: 40, bpmDo: 110,
      tony: [
        { struna: 4, prazec: p + 2 },
        { struna: 4, prazec: p + 2, technika: 'bend' },
        { struna: 4, prazec: p + 4 },
        { struna: 4, prazec: p + 2, technika: 'bend' },
        { struna: 4, prazec: p + 2, technika: 'vibrato' },
      ],
    },
    {
      id: 'tapping',
      nazev: 'Ťukání — trojice',
      technika: 'tapping',
      popis: 'Pravá ruka ťukne vysoký tón, levá dohraje odtahem a příklepem.',
      pozor: 'Ťuknutí je úder shora, ne stisk. Nepoužité struny dusit dlaní.',
      bpmOd: 50, bpmDo: 150,
      tony: [
        { struna: 4, prazec: p + 12, technika: 'tapping' },
        { struna: 4, prazec: p, technika: 'pull' },
        { struna: 4, prazec: p + 3, technika: 'hammer' },
        { struna: 4, prazec: p + 12, technika: 'tapping' },
        { struna: 4, prazec: p, technika: 'pull' },
        { struna: 4, prazec: p + 3, technika: 'hammer' },
      ],
    },
    {
      id: 'pavouk',
      nazev: 'Pavouk',
      technika: 'trsatko',
      popis: 'Prsty přeskakují mezi strunami — 1. prst dole, 3. nahoře a naopak.',
      pozor: 'Pomalu. Cílem je nezávislost prstů, ne rychlost.',
      bpmOd: 40, bpmDo: 130,
      tony: [
        { struna: 0, prazec: p }, { struna: 1, prazec: p + 2 },
        { struna: 0, prazec: p + 1 }, { struna: 1, prazec: p + 3 },
        { struna: 1, prazec: p }, { struna: 2, prazec: p + 2 },
        { struna: 1, prazec: p + 1 }, { struna: 2, prazec: p + 3 },
        { struna: 2, prazec: p }, { struna: 3, prazec: p + 2 },
        { struna: 2, prazec: p + 1 }, { struna: 3, prazec: p + 3 },
      ],
    },
  ];
}
