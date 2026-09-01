/**
 * Cvičení na stupnice.
 *
 * Projít stupnici nahoru a dolů je začátek, ne cvičení — prsty si
 * zapamatují jednu cestu a mimo ni jsou ztracené. Sekvence po terciích
 * a čtveřicích nutí hrát tytéž tóny v jiném pořadí, což je to, co se na
 * stupnicích doopravdy trénuje.
 *
 * Vzorce se zapisují jako stupně, ne jako tóny: tentýž vzorec pak platí
 * pro každou stupnici i tóninu.
 *
 * Bez závislostí, ať jde ověřit samostatně — na indexech přes oktávy se
 * snadno ujede o stupeň a v uchu to není poznat hned.
 */

export interface Cviceni {
  id: string;
  nazev: string;
  popis: string;
  /**
   * Posloupnost stupňů stupnice.
   *
   * Čísla můžou přesáhnout délku stupnice — pak se pokračuje ve vyšší
   * oktávě, což je právě to, co dělá sekvence použitelné přes celý krk.
   */
  stupne: (delka: number, oktav: number) => number[];
}

/** Nahoru po stupních a zase dolů. */
function nahoruDolu(delka: number, oktav: number): number[] {
  const vrchol = delka * oktav;
  const nahoru = Array.from({ length: vrchol + 1 }, (_, i) => i);
  // Vrchol se nehraje dvakrát — jinak na obrátce vznikne zádrhel.
  const dolu = nahoru.slice(0, -1).reverse();
  return [...nahoru, ...dolu];
}

/** Sekvence po skupinách: 1-2-3, 2-3-4, … a zpátky. */
function poSkupinach(velikost: number) {
  return (delka: number, oktav: number): number[] => {
    const vrchol = delka * oktav;
    const ven: number[] = [];
    for (let start = 0; start + velikost - 1 <= vrchol; start += 1) {
      for (let k = 0; k < velikost; k += 1) ven.push(start + k);
    }
    return ven;
  };
}

/** Intervalové dvojice: 1-3, 2-4, 3-5, … */
function poIntervalu(krok: number) {
  return (delka: number, oktav: number): number[] => {
    const vrchol = delka * oktav;
    const ven: number[] = [];
    for (let start = 0; start + krok <= vrchol; start += 1) {
      ven.push(start, start + krok);
    }
    return ven;
  };
}

export const CVICENI: Cviceni[] = [
  {
    id: 'nahoru_dolu',
    nazev: 'Nahoru a dolů',
    popis: 'Stupnice po stupních tam a zpátky. Na rozehřátí a na čistotu tónu.',
    stupne: nahoruDolu,
  },
  {
    id: 'tercie',
    nazev: 'Po terciích',
    popis: 'Dvojice ob jeden stupeň: 1-3, 2-4, 3-5. Rozbíjí naučenou cestu prstů.',
    stupne: poIntervalu(2),
  },
  {
    id: 'kvarty',
    nazev: 'Po kvartách',
    popis: 'Dvojice ob dva stupně: 1-4, 2-5, 3-6. Širší skoky, těžší na přesnost.',
    stupne: poIntervalu(3),
  },
  {
    id: 'trojice',
    nazev: 'Trojice',
    popis: 'Skupiny po třech: 1-2-3, 2-3-4. Klasické cvičení na trioly.',
    stupne: poSkupinach(3),
  },
  {
    id: 'ctverice',
    nazev: 'Čtveřice',
    popis: 'Skupiny po čtyřech: 1-2-3-4, 2-3-4-5. Sedí na šestnáctiny.',
    stupne: poSkupinach(4),
  },
];

/**
 * Převede stupně na čísla MIDI.
 *
 * Stupeň nad rámec stupnice pokračuje ve vyšší oktávě — bez toho by
 * sekvence skončila po jedné oktávě a přes celý krk by se nedostala.
 */
export function tonyCviceni(zaklad: number, intervaly: number[], stupne: number[]): number[] {
  if (!intervaly.length) return [];
  return stupne.map((d) => {
    const oktava = Math.floor(d / intervaly.length);
    const stupen = ((d % intervaly.length) + intervaly.length) % intervaly.length;
    return zaklad + oktava * 12 + intervaly[stupen];
  });
}

export function cviceniPodleId(id: string): Cviceni | undefined {
  return CVICENI.find((c) => c.id === id);
}
