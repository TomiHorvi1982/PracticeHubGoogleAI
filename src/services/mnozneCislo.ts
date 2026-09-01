/**
 * Skloňování počtu v češtině.
 *
 * Tři tvary, ne dva: jedna skladba, dvě skladby, pět skladeb. Angličtina
 * si vystačí s „1 song / 2 songs", takže se to v kódu snadno zapomene a
 * z aplikace pak leze „přidáno 1 skladeb".
 *
 * Bez závislostí, ať jde ověřit samostatně.
 */

export type Tvary = [jedna: string, dveAzCtyri: string, pet: string];

export function mnozne(pocet: number, tvary: Tvary): string {
  const n = Math.abs(Math.round(pocet));
  if (n === 1) return `${pocet} ${tvary[0]}`;
  if (n >= 2 && n <= 4) return `${pocet} ${tvary[1]}`;
  return `${pocet} ${tvary[2]}`;
}

export const skladby = (n: number) => mnozne(n, ['skladba', 'skladby', 'skladeb']);
export const soubory = (n: number) => mnozne(n, ['soubor', 'soubory', 'souborů']);
