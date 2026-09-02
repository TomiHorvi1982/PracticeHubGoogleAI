/**
 * Poznávání nových sad ve složce se separovaným zvukem.
 *
 * Separátor sype stopy na disk a pult se ptá serveru dokola, co tam
 * přibylo. Dvě věci se přitom dají splést, a proto jsou tady zvlášť
 * od komponenty: ohlásit jako novou sadu něco, co tam bylo od začátku,
 * a chytit soubor uprostřed zápisu.
 */

/** Kolik stop sada má a co dohromady váží. */
export interface OtiskSady { pocet: number; velikost: number }

interface SkladbaSeStopami {
  nazev: string;
  stopy: { velikost: number }[];
}

/**
 * Sejme otisk každé sady.
 *
 * Počet i celková velikost dohromady: přibývající stopa změní počet,
 * dopisovaný wav jen velikost. Sama o sobě by ani jedna hodnota
 * nestačila.
 */
export function otisky(skladby: SkladbaSeStopami[]): Map<string, OtiskSady> {
  const m = new Map<string, OtiskSady>();
  for (const s of skladby) {
    m.set(s.nazev, {
      pocet: s.stopy.length,
      velikost: s.stopy.reduce((a, t) => a + t.velikost, 0),
    });
  }
  return m;
}

/**
 * Které sady jsou opravdu nové a dopsané.
 *
 * Nová je ta, kterou jsme ještě neviděli. Dopsaná je ta, jejíž otisk
 * se od minulého dotazu nezměnil — separátor u čtyřicetimegabajtového
 * wavu chvíli píše a načíst ho v půlce by dalo useknutou stopu.
 * Proto se hlásí až napodruhé, ne hned jak se soubor objeví.
 */
export function stabilniNove(
  minule: Map<string, OtiskSady>,
  ted: Map<string, OtiskSady>,
  jizVidene: Set<string>,
): string[] {
  const nove: string[] = [];
  for (const [nazev, o] of ted) {
    if (jizVidene.has(nazev)) continue;
    const d = minule.get(nazev);
    if (!d) continue; // teprve se objevila, počkáme na další kolo
    if (d.pocet === o.pocet && d.velikost === o.velikost) nove.push(nazev);
  }
  return nove;
}
