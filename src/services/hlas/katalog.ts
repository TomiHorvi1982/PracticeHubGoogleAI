/**
 * Katalog toho, co umí hlasové ovládání.
 *
 * Příkaz nikdy nespouští libovolný kód — skládá se z akcí zapsaných tady
 * a nikde jinde. Díky tomu se dá vypsat, co appka umí a co ne, a příkaz
 * vyrobený z popisu se dá před uložením ukázat po krocích.
 *
 * Sled kroků je obecnější tvar: jedna akce je sled o jednom kroku, takže
 * jednoduchý i vícekrokový příkaz jsou jedna a tatáž věc.
 */

import { SEKCE_HLASEM } from '../../components/layout/sekce';

export type TypParametru = 'text' | 'cislo' | 'sekce';

export interface ParametrAkce {
  klic: string;
  nazev: string;
  typ: TypParametru;
  /** Meze u čísel — tempo pod 20 nebo nad 300 nedává smysl. */
  od?: number;
  do?: number;
  vychozi?: string | number;
}

export interface Akce {
  id: string;
  nazev: string;
  /** Věta, kterou se akce vysvětlí v katalogu. */
  popis: string;
  /** Do které části aplikace patří — jen pro přehled. */
  skupina: 'přehrávání' | 'navigace' | 'metronom' | 'nahrávání' | 'zpěvník';
  parametry: ParametrAkce[];
  /** Fráze, kterými akce funguje hned, bez vlastního příkazu. */
  vychoziFraze: string[];
}

/** Jeden krok příkazu: která akce a s jakými hodnotami. */
export interface Krok {
  akce: string;
  hodnoty: Record<string, string | number>;
}

export interface HlasovyPrikaz {
  id: string;
  nazev: string;
  fraze: string[];
  kroky: Krok[];
  /** Vlastní příkazy jdou upravit i smazat, vestavěné ne. */
  vlastni: boolean;
}

/**
 * Sekce, do kterých se dá přepnout hlasem.
 *
 * Bere se ze seznamu u navigace, ne z vlastní kopie — dvě kopie se
 * dřív nebo později rozejdou a katalog by sliboval sekci, která už se
 * jmenuje jinak.
 */
export const SEKCE = Object.keys(SEKCE_HLASEM);

/**
 * Vestavěné akce.
 *
 * Záměrně jen to, co jde udělat bez potvrzení a bez rizika: hlasem se
 * nemaže a nerozesílá. Nic z toho se nedá vzít zpět jinak než opačným
 * příkazem, a to musí jít samo.
 */
export const AKCE: Akce[] = [
  {
    id: 'prehravani.spust',
    nazev: 'Spustit přehrávání',
    popis: 'Rozjede to, co je zrovna ve spodním přehrávači.',
    skupina: 'přehrávání',
    parametry: [],
    vychoziFraze: ['spusť přehrávání', 'hraj', 'přehraj'],
  },
  {
    id: 'prehravani.zastav',
    nazev: 'Zastavit přehrávání',
    popis: 'Pozastaví přehrávač.',
    skupina: 'přehrávání',
    parametry: [],
    vychoziFraze: ['zastav', 'pauza', 'stop'],
  },
  {
    id: 'prehravani.dalsi',
    nazev: 'Další skladba',
    popis: 'Přeskočí na další položku playlistu.',
    skupina: 'přehrávání',
    parametry: [],
    vychoziFraze: ['další skladba', 'další'],
  },
  {
    id: 'prehravani.predchozi',
    nazev: 'Předchozí skladba',
    popis: 'Vrátí se na předchozí položku playlistu.',
    skupina: 'přehrávání',
    parametry: [],
    vychoziFraze: ['předchozí skladba', 'zpátky'],
  },
  {
    id: 'navigace.otevri',
    nazev: 'Otevřít sekci',
    popis: 'Přepne aplikaci do zvolené sekce.',
    skupina: 'navigace',
    parametry: [{ klic: 'sekce', nazev: 'Sekce', typ: 'sekce', vychozi: 'pódium' }],
    vychoziFraze: ['otevři'],
  },
  {
    id: 'metronom.tempo',
    nazev: 'Nastavit tempo',
    popis: 'Přepíše tempo metronomu na zadanou hodnotu.',
    skupina: 'metronom',
    parametry: [{ klic: 'bpm', nazev: 'Tempo', typ: 'cislo', od: 20, do: 300, vychozi: 120 }],
    vychoziFraze: ['nastav tempo', 'tempo'],
  },
  {
    id: 'metronom.zapni',
    nazev: 'Zapnout metronom',
    popis: 'Rozjede metronom v nastaveném tempu.',
    skupina: 'metronom',
    parametry: [],
    vychoziFraze: ['zapni metronom', 'metronom'],
  },
  {
    id: 'metronom.vypni',
    nazev: 'Vypnout metronom',
    popis: 'Ztiší metronom.',
    skupina: 'metronom',
    parametry: [],
    vychoziFraze: ['vypni metronom'],
  },
  {
    id: 'prehravani.odzacatku',
    nazev: 'Od začátku',
    popis: 'Vrátí právě hranou položku na začátek.',
    skupina: 'přehrávání',
    parametry: [],
    vychoziFraze: ['od začátku', 'znovu'],
  },
  {
    id: 'prehravani.rezim',
    nazev: 'Režim přehrávání',
    popis: 'Přepne mezi normálním, dokola a náhodně.',
    skupina: 'přehrávání',
    parametry: [{ klic: 'rezim', nazev: 'Režim', typ: 'text', vychozi: 'normální' }],
    vychoziFraze: ['přehrávej', 'režim'],
  },
  {
    id: 'metronom.rychleji',
    nazev: 'Zrychlit',
    popis: 'Přidá metronomu tempo; bez čísla o pět.',
    skupina: 'metronom',
    parametry: [{ klic: 'o', nazev: 'O kolik', typ: 'cislo', od: 1, do: 60, vychozi: 5 }],
    vychoziFraze: ['zrychli', 'rychleji'],
  },
  {
    id: 'metronom.pomaleji',
    nazev: 'Zpomalit',
    popis: 'Ubere metronomu tempo; bez čísla o pět.',
    skupina: 'metronom',
    parametry: [{ klic: 'o', nazev: 'O kolik', typ: 'cislo', od: 1, do: 60, vychozi: 5 }],
    vychoziFraze: ['zpomal', 'pomaleji'],
  },
  {
    id: 'hudba.tonina',
    nazev: 'Nastavit tóninu',
    popis: 'Přepne tóninu, ze které vychází hmatník i nástroje.',
    skupina: 'zpěvník',
    parametry: [{ klic: 'tonina', nazev: 'Tónina', typ: 'text' }],
    vychoziFraze: ['tónina', 'nastav tóninu'],
  },
  {
    id: 'hudba.transpozice',
    nazev: 'Transpozice',
    popis: 'Posune skladbu o zadaný počet půltónů.',
    skupina: 'zpěvník',
    parametry: [{ klic: 'pultonu', nazev: 'Půltóny', typ: 'cislo', od: -12, do: 12, vychozi: 0 }],
    vychoziFraze: ['transponuj', 'transpozice'],
  },
  {
    id: 'hudba.kapodastr',
    nazev: 'Kapodastr',
    popis: 'Nastaví pražec, na kterém je kapodastr.',
    skupina: 'zpěvník',
    parametry: [{ klic: 'prazec', nazev: 'Pražec', typ: 'cislo', od: 0, do: 12, vychozi: 0 }],
    vychoziFraze: ['kapodastr', 'kapo'],
  },
  {
    id: 'zpevnik.otevriSkladbu',
    nazev: 'Otevřít skladbu',
    popis: 'Najde skladbu ve zpěvníku podle názvu a otevře ji.',
    skupina: 'zpěvník',
    parametry: [{ klic: 'nazev', nazev: 'Název skladby', typ: 'text' }],
    vychoziFraze: ['otevři skladbu', 'najdi skladbu'],
  },
];

export function akcePodleId(id: string): Akce | undefined {
  return AKCE.find((a) => a.id === id);
}

/**
 * Ověří, že krok dává smysl, ještě než se uloží.
 *
 * Příkaz sestavený z popisu vzniká strojově, takže se může odvolat na
 * akci, která neexistuje, nebo poslat tempo 5000. Vrací seznam výhrad —
 * prázdný znamená, že je krok v pořádku.
 */
export function vyhradyKeKroku(krok: Krok): string[] {
  const akce = akcePodleId(krok.akce);
  if (!akce) return [`Akce „${krok.akce}" neexistuje.`];

  const vyhrady: string[] = [];
  for (const p of akce.parametry) {
    const h = krok.hodnoty?.[p.klic];
    if (h === undefined || h === '') {
      if (p.vychozi === undefined) vyhrady.push(`Chybí ${p.nazev.toLowerCase()}.`);
      continue;
    }
    if (p.typ === 'cislo') {
      const c = Number(h);
      if (!Number.isFinite(c)) vyhrady.push(`${p.nazev} musí být číslo.`);
      else if (p.od !== undefined && c < p.od) vyhrady.push(`${p.nazev} je pod ${p.od}.`);
      else if (p.do !== undefined && c > p.do) vyhrady.push(`${p.nazev} je nad ${p.do}.`);
    }
    if (p.typ === 'sekce' && !SEKCE.includes(String(h))) {
      vyhrady.push(`Sekce „${h}" neexistuje.`);
    }
  }
  return vyhrady;
}
