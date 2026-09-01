/**
 * Sběr tónů zahraných po sobě do jednoho akordu.
 *
 * Na kytaru se akord často rozebírá po strunách — šest tónů dorazí
 * během vteřiny až dvou, ale jsou to tóny jednoho akordu, ne šest
 * samostatných. Tenhle modul rozhoduje, co ještě patří k sobě a kde
 * začíná další akord.
 *
 * Bez závislostí, ať jde ověřit samostatně — u časování je to
 * důležitější než jinde, protože chybu v něm nejde poznat okem.
 */

export interface Uder {
  midi: number;
  cas: number;
}

/**
 * Mezera, po které se akord uzavře.
 *
 * Rozebrat šest strun trvá i vteřinu, takže krátké okno by akord
 * rozsekalo na kusy. Naopak příliš dlouhé by slepilo dva akordy za
 * sebou do jednoho chumlu.
 */
export const MEZERA_MS = 1200;

/** Nejdelší doba, po kterou se akord sbírá, i když se hraje pořád dál. */
export const NEJDELE_MS = 4000;

/**
 * Rozdělí údery na akordy.
 *
 * Nový akord začíná tam, kde je mezi údery mezera delší než `MEZERA_MS`,
 * nebo kde už sběr běží déle než `NEJDELE_MS` — jinak by nepřetržité
 * brnkání nikdy neskončilo a nic by se nevyhodnotilo.
 */
export function rozdelNaAkordy(
  udery: Uder[],
  mezera = MEZERA_MS,
  nejdele = NEJDELE_MS,
): number[][] {
  const akordy: number[][] = [];
  let soucasny: Uder[] = [];

  const uzavri = () => {
    if (soucasny.length) akordy.push(zTonu(soucasny));
    soucasny = [];
  };

  for (const u of udery) {
    if (!soucasny.length) {
      soucasny.push(u);
      continue;
    }
    const predchozi = soucasny[soucasny.length - 1];
    const odZacatku = u.cas - soucasny[0].cas;
    if (u.cas - predchozi.cas > mezera || odZacatku > nejdele) {
      uzavri();
      soucasny.push(u);
      continue;
    }
    soucasny.push(u);
  }

  uzavri();
  return akordy;
}

/**
 * Tóny akordu bez opakování.
 *
 * Táž struna se při rozebírání často ozve dvakrát a mikrofon k tomu
 * občas přidá vyšší harmonickou jako samostatný tón. Duplicity by
 * rozpoznávání akordu jen mátly.
 */
function zTonu(udery: Uder[]): number[] {
  return [...new Set(udery.map((u) => u.midi))].sort((a, b) => a - b);
}

/**
 * Živý sběr.
 *
 * Nad tímtéž pravidlem, jen po jednom úderu — pro poslech z mikrofonu,
 * kde údery chodí postupně a rozhodnutí musí padnout bez znalosti
 * budoucnosti.
 */
export class SberacAkordu {
  private udery: Uder[] = [];

  constructor(
    private readonly mezera = MEZERA_MS,
    private readonly nejdele = NEJDELE_MS,
  ) {}

  /**
   * Přidá úder a řekne, jestli tím předchozí akord skončil.
   *
   * Vrací uzavřený akord, nebo null, když se pořád sbírá.
   */
  public pridej(u: Uder): number[] | null {
    if (!this.udery.length) {
      this.udery.push(u);
      return null;
    }
    const predchozi = this.udery[this.udery.length - 1];
    const odZacatku = u.cas - this.udery[0].cas;

    if (u.cas - predchozi.cas > this.mezera || odZacatku > this.nejdele) {
      const hotovy = zTonu(this.udery);
      this.udery = [u];
      return hotovy;
    }

    this.udery.push(u);
    return null;
  }

  /** Co se zatím nasbíralo — pro průběžné zobrazení. */
  public rozpracovany(): number[] {
    return zTonu(this.udery);
  }

  /**
   * Uzavře sběr, i když další úder nepřišel.
   *
   * Poslední akord by jinak zůstal viset: nikdo už nezahraje tón, který
   * by ho uzavřel, a tak by se nikdy nevyhodnotil.
   */
  public uzavri(): number[] | null {
    if (!this.udery.length) return null;
    const hotovy = zTonu(this.udery);
    this.udery = [];
    return hotovy;
  }

  public vycisti(): void {
    this.udery = [];
  }
}
