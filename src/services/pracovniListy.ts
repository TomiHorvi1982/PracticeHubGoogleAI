/**
 * Pracovní listy k tisku.
 *
 * Kytara se učí rukama, ale teorie se usadí, až si ji dítě napíše.
 * Generuje se to z aplikace, ne aby se skenovaly cizí sešity: pojmy se
 * berou z osnovy, takže list vždycky sedí na stupeň, ve kterém dítě je.
 *
 * Bez databáze i bez prohlížeče, aby šlo všechno ověřit testem — na
 * osmisměrce, kterou nikdo nezkontroloval, se dá strávit půl hodiny
 * a nenajít nic.
 */

/** Náhoda, kterou jde v testu předepsat. */
export type Nahoda = () => number;

/**
 * Náhoda ze semínka.
 *
 * Aby se týž list vytiskl dvakrát stejně — dítě si ho poztrácí a chce
 * ten samý, ne nový. A v testu je pak výsledek předvídatelný.
 */
export function nahodaZeSemene(semeno: number): Nahoda {
  let s = semeno >>> 0 || 1;
  return () => {
    // xorshift32 — pár řádků, žádná závislost, a na osmisměrku bohatě stačí
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function zamichej<T>(pole: T[], nahoda: Nahoda): T[] {
  const k = [...pole];
  for (let i = k.length - 1; i > 0; i--) {
    const j = Math.floor(nahoda() * (i + 1));
    [k[i], k[j]] = [k[j], k[i]];
  }
  return k;
}

/* ------------------------------------------------------------------
 * Osmisměrka
 * ------------------------------------------------------------------ */

export interface Osmismerka {
  mrizka: string[][];
  /** Slova, která se povedlo umístit. */
  slova: string[];
  /** Slova, na která v mřížce nezbylo místo. */
  neumistena: string[];
  /** Zbylá písmena po řádcích — tajenka. */
  tajenka: string;
}

const SMERY: [number, number][] = [
  [0, 1], [1, 0], [1, 1], [1, -1],
  [0, -1], [-1, 0], [-1, -1], [-1, 1],
];

/** Diakritika pryč: v mřížce písmen se háčky nedají číst ani škrtat. */
export function bezDiakritiky(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Postaví osmisměrku ze zadaných slov a tajenky.
 *
 * Tajenka se do mřížky nevkládá jako slovo — je to to, co zbude. Proto
 * se velikost mřížky odvozuje od délky tajenky: musí zůstat přesně tolik
 * volných políček, kolik má tajenka písmen, jinak by nevyšla.
 */
export function osmismerka(slovaVstup: string[], tajenkaVstup: string, nahoda: Nahoda): Osmismerka {
  const slova = slovaVstup.map(bezDiakritiky).filter((s) => s.length >= 3);
  const tajenka = bezDiakritiky(tajenkaVstup);

  const pismenSlov = slova.reduce((n, s) => n + s.length, 0);
  // Strana mřížky: vejde se do ní všechno plus tajenka, a ještě něco navíc,
  // aby měl generátor kam uhýbat.
  const strana = Math.max(
    8,
    Math.ceil(Math.sqrt((pismenSlov + tajenka.length) * 1.9)),
    ...slova.map((s) => s.length),
  );

  const mrizka: (string | null)[][] = Array.from({ length: strana }, () => Array(strana).fill(null));
  const umistena: string[] = [];
  const neumistena: string[] = [];

  const sedne = (slovo: string, r: number, c: number, dr: number, dc: number): boolean => {
    for (let i = 0; i < slovo.length; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      if (rr < 0 || rr >= strana || cc < 0 || cc >= strana) return false;
      const m = mrizka[rr][cc];
      // Křížení na stejném písmenu je v pořádku a mřížku zhustí.
      if (m !== null && m !== slovo[i]) return false;
    }
    return true;
  };

  for (const slovo of [...slova].sort((a, b) => b.length - a.length)) {
    let hotovo = false;
    // Zkusí se náhodná místa; po dost pokusech se slovo vzdá, aby se
    // generátor nezacyklil na mřížce, kam se prostě nevejde.
    for (let pokus = 0; pokus < strana * strana * 4 && !hotovo; pokus++) {
      const [dr, dc] = SMERY[Math.floor(nahoda() * SMERY.length)];
      const r = Math.floor(nahoda() * strana);
      const c = Math.floor(nahoda() * strana);
      if (!sedne(slovo, r, c, dr, dc)) continue;
      for (let i = 0; i < slovo.length; i++) mrizka[r + dr * i][c + dc * i] = slovo[i];
      umistena.push(slovo);
      hotovo = true;
    }
    if (!hotovo) neumistena.push(slovo);
  }

  // Zbylá políčka doplní tajenka, po řádcích zleva doprava. Když je
  // tajenka kratší, dosype se náhodnými písmeny.
  const abeceda = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let kde = 0;
  const hotova: string[][] = mrizka.map((radek) => radek.map((p) => {
    if (p !== null) return p;
    if (kde < tajenka.length) return tajenka[kde++];
    return abeceda[Math.floor(nahoda() * abeceda.length)];
  }));

  return {
    mrizka: hotova,
    slova: umistena,
    neumistena,
    // Co se z tajenky doopravdy vešlo. Delší tajenka než volných políček
    // by se v řešení useknutá jen matoucí.
    tajenka: tajenka.slice(0, kde),
  };
}

/* ------------------------------------------------------------------
 * Spojovačka
 * ------------------------------------------------------------------ */

export interface Spojovacka {
  vlevo: { klic: string; text: string }[];
  vpravo: { klic: string; text: string }[];
}

/**
 * Dvojice k spojení čarou.
 *
 * Pravý sloupec se zamíchá — kdyby zůstal v pořadí, dítě spojí čáry
 * vodorovně a nic se nenaučí. Když se náhodou zamíchá do původního
 * pořadí, zamíchá se znovu.
 */
export function spojovacka(dvojice: [string, string][], nahoda: Nahoda): Spojovacka {
  const vlevo = dvojice.map(([a], i) => ({ klic: String(i), text: a }));
  let vpravo = dvojice.map(([, b], i) => ({ klic: String(i), text: b }));
  if (dvojice.length > 1) {
    for (let pokus = 0; pokus < 12; pokus++) {
      vpravo = zamichej(dvojice.map(([, b], i) => ({ klic: String(i), text: b })), nahoda);
      if (vpravo.some((x, i) => x.klic !== String(i))) break;
    }
  }
  return { vlevo, vpravo };
}

/* ------------------------------------------------------------------
 * Kvintový kruh
 * ------------------------------------------------------------------ */

export interface PoziceKruhu {
  tonina: string;
  /** Kolik křížků (kladné) nebo béček (záporné). */
  predznamenani: number;
  /** Úhel ve stupních, dvanáctka nahoře. */
  uhel: number;
}

/**
 * Dvanáct tónin po kvintách.
 *
 * C je nahoře a jde se po směru hodin — tak se kruh kreslí ve všech
 * učebnicích a dítě, které ho pak uvidí jinde, ho pozná.
 */
export function kvintovyKruh(): PoziceKruhu[] {
  const poRade = ['C', 'G', 'D', 'A', 'E', 'H', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
  return poRade.map((tonina, i) => ({
    tonina,
    // Za F# se dál počítá jako béčka; F má jedno béčko.
    predznamenani: i <= 6 ? i : i - 12,
    uhel: i * 30,
  }));
}

/* ------------------------------------------------------------------
 * Notové bingo
 * ------------------------------------------------------------------ */

/**
 * Karta binga.
 *
 * Pětkrát pět políček s tóny, uprostřed volné pole — jako v opravdovém
 * bingu. Tóny se neopakují, jinak by se jedním zavoláním škrtla dvě
 * políčka a hra by skončila dřív, než začne.
 */
export function bingoKarta(tony: string[], nahoda: Nahoda): (string | null)[][] {
  const zasoba = zamichej(tony, nahoda);
  const potreba = 24;
  const vybrane: string[] = [];
  for (let i = 0; i < potreba; i++) {
    vybrane.push(zasoba[i % zasoba.length]);
  }
  const karta: (string | null)[][] = [];
  let kde = 0;
  for (let r = 0; r < 5; r++) {
    const radek: (string | null)[] = [];
    for (let c = 0; c < 5; c++) {
      radek.push(r === 2 && c === 2 ? null : vybrane[kde++]);
    }
    karta.push(radek);
  }
  return karta;
}

/* ------------------------------------------------------------------
 * Pojmy podle stupně — čím se plní osmisměrka a spojovačka
 * ------------------------------------------------------------------ */

export const POJMY_STUPNE: Record<number, string[]> = {
  1: ['STRUNA', 'PRAZEC', 'TRSATKO', 'NOTA', 'PAUZA', 'TAKT', 'KYTARA', 'LADICKA'],
  2: ['AKORD', 'OSMINA', 'KRIZEK', 'BECKO', 'OSNOVA', 'KLIC', 'RYTMUS', 'DOBA'],
  3: ['STUPNICE', 'TONIKA', 'OKTAVA', 'INTERVAL', 'PENTATONIKA', 'BARRE', 'PRIKLEP', 'ODTAH'],
  4: ['KVINTA', 'TERCIE', 'TRANSPOZICE', 'KAPODASTR', 'TONINA', 'SEPTIMA', 'SKLUZ', 'NATAZENI'],
  5: ['SYNKOPA', 'TRIOLA', 'DOMINANTA', 'SUBDOMINANTA', 'PARALELKA', 'SESTNACTINA', 'CHUG', 'AKCENT'],
  6: ['DORSKA', 'MIXOLYDICKA', 'SEPTAKORD', 'IMPROVIZACE', 'TAPPING', 'MODUS', 'RIFF', 'HARMONIE'],
};

export const TAJENKY_STUPNE: Record<number, string> = {
  1: 'HRAJ KAZDY DEN',
  2: 'RYTMUS JE ZAKLAD',
  3: 'POMALU A CISTE',
  4: 'POSLOUCHEJ SE',
  5: 'RUKA JEDE PORAD',
  6: 'HRAJ PO SVEM',
};
