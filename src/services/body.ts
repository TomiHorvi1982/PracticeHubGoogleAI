/**
 * Body a odměny.
 *
 * Body sbírá aplikace, ceník odměn si píše učitel a výměna proběhne na
 * hodině. Aplikace nikomu nic neslibuje — jen počítá a ukáže stav.
 *
 * Bez databáze, aby šlo ověřit testem. Sazby jsou tady schválně jako
 * kód: kdyby se daly měnit za běhu, přestala by platit domluva, za co
 * se body dávají — a s ní i důvod je sbírat.
 */

export interface ZaznamBodu {
  id: string;
  zak_id: string;
  pocet: number;
  za_co: string;
  zdroj: string | null;
  vymeneno_za: string | null;
  datum: string;
}

export interface Odmena {
  id: string;
  nazev: string;
  cena: number;
  aktivni: boolean;
}

/**
 * Kolik se za co dává.
 *
 * Nejvíc je za docházení a odevzdávání, ne za výkon. Na „cvičil pět dní"
 * dosáhne i ten, komu to zatím moc nejde — a právě ten to potřebuje
 * nejvíc. Kdyby se odměňoval jen výsledek, sbíral by body ten, kdo je
 * nepotřebuje.
 */
export const SAZBY = {
  ukolVcas: 10,
  ukolPozde: 5,
  ukolNaTempo: 5,
  kvizBezChyby: 15,
  kvizDokoncen: 5,
  serieDnu: 20,
  dovednost: 25,
  stupen: 100,
} as const;

/** Kolik dní v řadě se počítá jako série. */
export const DNU_V_SERII = 5;

export function zustatek(zaznamy: ZaznamBodu[]): number {
  return zaznamy.reduce((n, z) => n + z.pocet, 0);
}

/** Kolik dítě celkem nasbíralo — bez odečtených výměn. */
export function nasbirano(zaznamy: ZaznamBodu[]): number {
  return zaznamy.filter((z) => z.pocet > 0).reduce((n, z) => n + z.pocet, 0);
}

export function lzeVymenit(zaznamy: ZaznamBodu[], odmena: Odmena): boolean {
  return odmena.aktivni && zustatek(zaznamy) >= odmena.cena;
}

/*
 * Klíče zdrojů.
 *
 * Databáze na `(zak_id, zdroj)` drží jedinečnost, takže za tentýž úkol
 * se body nedají dvakrát, ať se tlačítko zmáčkne kolikrát chce. Skládají
 * se tady, aby se tvar klíče nepsal na pěti místech jinak.
 */
export const zdrojUkolu = (id: string) => `ukol:${id}`;
export const zdrojKvizu = (id: string) => `kviz:${id}`;
export const zdrojDovednosti = (id: string) => `dovednost:${id}`;
export const zdrojStupne = (stupen: number) => `stupen:${stupen}`;
export const zdrojSerie = (posledniDen: string) => `serie:${posledniDen}`;

/**
 * Body za odevzdaný úkol.
 *
 * Pozdě odevzdaný úkol dostane míň, ale ne nulu: dítě, které to dodělalo
 * o dva dny později, udělalo přesně to, co po něm chceme.
 */
export function bodyZaUkol(vcas: boolean, naCilovéTempo: boolean): number {
  return (vcas ? SAZBY.ukolVcas : SAZBY.ukolPozde) + (naCilovéTempo ? SAZBY.ukolNaTempo : 0);
}

/** Body za kvíz. Bez chyby plná sazba, jinak něco za dokončení. */
export function bodyZaKviz(spravne: number, celkem: number): number {
  if (celkem <= 0) return 0;
  return spravne === celkem ? SAZBY.kvizBezChyby : SAZBY.kvizDokoncen;
}

/**
 * Nejdelší série dnů v řadě, která končí dnes nebo včera.
 *
 * Včera se počítá schválně: kdo cvičil pět dní a dnes ještě nezačal,
 * o sérii nepřijde v poledne. Přeruší ji až celý vynechaný den.
 */
export function serieDnu(datumy: string[], dnes = new Date()): number {
  if (!datumy.length) return 0;
  const dny = new Set(datumy.map((d) => d.slice(0, 10)));
  const den = (posun: number) => {
    const d = new Date(dnes);
    d.setDate(d.getDate() - posun);
    return d.toISOString().slice(0, 10);
  };

  // Od kterého dne se počítá zpátky — od dneška, nebo od včerejška.
  let zacatek = dny.has(den(0)) ? 0 : dny.has(den(1)) ? 1 : -1;
  if (zacatek < 0) return 0;

  let delka = 0;
  while (dny.has(den(zacatek + delka))) delka++;
  return delka;
}

/** Má se za sérii připsat odměna? */
export function serieDosazena(datumy: string[], dnes = new Date()): boolean {
  return serieDnu(datumy, dnes) >= DNU_V_SERII;
}

/**
 * Jak vypadá ceník pro dítě.
 *
 * Nejlevnější napřed a nedostupné až za tím, co si může dovolit teď —
 * ceník, ve kterém je první věc za tři sta bodů, vypadá jako by na něj
 * nikdy nedosáhlo.
 */
export function seradOdmeny(odmeny: Odmena[], zustatekBodu: number): Odmena[] {
  return [...odmeny]
    .filter((o) => o.aktivni)
    .sort((a, b) => {
      const dosahneA = a.cena <= zustatekBodu;
      const dosahneB = b.cena <= zustatekBodu;
      if (dosahneA !== dosahneB) return dosahneA ? -1 : 1;
      return a.cena - b.cena;
    });
}
