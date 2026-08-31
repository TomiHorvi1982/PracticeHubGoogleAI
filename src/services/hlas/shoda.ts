/**
 * Porovnání toho, co člověk řekl, s uloženými příkazy.
 *
 * Přepis nikdy nesedí na písmeno: whisper píše „tempo sto dvacet" i
 * „Tempo 120.", jednou s diakritikou, jednou bez. Porovnává se proto
 * očištěný tvar a bere se nejlepší shoda nad prahem — ne přesná rovnost.
 *
 * Bez závislostí, ať jde ověřit samostatně.
 */

/** Co whisper napíše, když mu pustíte hluk nebo ticho. */
const VYMYSLY = [
  'titulky vytvoril',
  'titulky pro',
  'preklad titulku',
  'diky za sledovani',
  'dekuji za pozornost',
  'amara org',
  'subtitles by',
  'thanks for watching',
];

export function normalizuj(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Poznat, že whisper jen vymýšlel.
 *
 * Na ticho a hluk vrací ustálené věty z titulků, na kterých se učil.
 * Naměřeno rovnou: dvě sekundy čistého tónu daly „Titulky vytvořil…".
 * Kdyby se to pustilo do porovnávání, občas by to spustilo náhodný
 * příkaz — a to je horší než nerozumět.
 */
export function jeVymysl(text: string): boolean {
  const n = normalizuj(text);
  if (!n) return true;
  return VYMYSLY.some((v) => n.includes(v));
}

const CISLOVKY: Record<string, number> = {
  nula: 0, jedna: 1, jeden: 1, dva: 2, dve: 2, tri: 3, ctyri: 4, pet: 5,
  sest: 6, sedm: 7, osm: 8, devet: 9, deset: 10, jedenact: 11, dvanact: 12,
  trinact: 13, ctrnact: 14, patnact: 15, sestnact: 16, sedmnact: 17,
  osmnact: 18, devatenact: 19, dvacet: 20, tricet: 30, ctyricet: 40,
  padesat: 50, sedesat: 60, sedmdesat: 70, osmdesat: 80, devadesat: 90,
  sto: 100, stodvacet: 120, dveste: 200, tristo: 300,
};

/**
 * Vytáhne z věty číslo — číslicí i slovem.
 *
 * Tempo se diktuje oběma způsoby a whisper si vybírá sám, takže rozumět
 * musí obojímu. Slova se sčítají zleva („sto dvacet" = 120), což pro
 * rozsah, ve kterém se pohybuje tempo, stačí.
 */
export function cisloZVety(text: string): number | null {
  const n = normalizuj(text);

  const cislice = n.match(/\d+/);
  if (cislice) return Number(cislice[0]);

  let soucet = 0;
  let naslo = false;
  for (const slovo of n.split(' ')) {
    const h = CISLOVKY[slovo];
    if (h === undefined) continue;
    naslo = true;
    soucet += h;
  }
  return naslo ? soucet : null;
}

/** Podíl slov, která mají obě věty společná — 0 až 1. */
export function podobnost(a: string, b: string): number {
  const sa = normalizuj(a).split(' ').filter(Boolean);
  const sb = normalizuj(b).split(' ').filter(Boolean);
  if (!sa.length || !sb.length) return 0;

  const zbytek = [...sb];
  let spolecnych = 0;
  for (const slovo of sa) {
    const kde = zbytek.indexOf(slovo);
    if (kde >= 0) {
      spolecnych += 1;
      zbytek.splice(kde, 1);
    }
  }
  // Dělí se delší z vět, aby „tempo" nesedělo na „tempo sto dvacet" na
  // sto procent — kratší fráze by pak vyhrávala vždycky.
  return spolecnych / Math.max(sa.length, sb.length);
}

export interface UlozenyPrikaz {
  id: string;
  nazev: string;
  /** Fráze, kterými se příkaz spouští. Stačí, aby sedla jedna. */
  fraze: string[];
}

export interface Nalez<T extends UlozenyPrikaz> {
  prikaz: T;
  fraze: string;
  jistota: number;
  cislo: number | null;
}

/** Práh, pod kterým se raději neudělá nic. */
export const PRAH = 0.6;

/**
 * Věta bez čísel — číslice i číslovky pryč.
 *
 * Nadiktovaný parametr do fráze nepatří: „nastav tempo sto padesát" má
 * spustit příkaz uložený jako „nastav tempo", ale ta dvě slova navíc by
 * shodu srazila pod práh. Číslo se z věty čte zvlášť.
 */
export function bezCisel(text: string): string {
  return normalizuj(text)
    .split(' ')
    .filter((s) => s && !/^\d+$/.test(s) && CISLOVKY[s] === undefined)
    .join(' ');
}

/**
 * Najde příkaz, který nejlíp sedí na přepis.
 *
 * Vrací null, když si není jistý — na pódiu je nečinnost lepší než
 * spuštění něčeho jiného, než člověk chtěl.
 */
export function najdiPrikaz<T extends UlozenyPrikaz>(
  prepis: string,
  prikazy: T[],
  prah = PRAH,
): Nalez<T> | null {
  if (jeVymysl(prepis)) return null;

  let nej: Nalez<T> | null = null;
  for (const p of prikazy) {
    for (const f of p.fraze) {
      const jistota = podobnost(bezCisel(prepis), f);
      if (jistota >= prah && (!nej || jistota > nej.jistota)) {
        nej = { prikaz: p, fraze: f, jistota, cislo: cisloZVety(prepis) };
      }
    }
  }
  return nej;
}
