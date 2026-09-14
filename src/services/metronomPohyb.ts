/**
 * Pohyb jezdce metronomu.
 *
 * Jezdec jezdí zleva doprava a zpátky a na každé klepnutí stojí přesně
 * na kraji. Poloha se počítá z pozice metronomu v dobách
 * (`metronomService.pozice()`), tedy ze stejných hodin, podle kterých
 * se kliká — ne z vlastního časovače, který by se se zvukem rozešel.
 */

/**
 * Kde je jezdec: 0 = levý kraj, 1 = pravý.
 *
 * Kosinus místo rovnoměrného pohybu: u kraje jezdec zpomalí jako kyvadlo,
 * takže okamžik úderu je vidět, a přes střed projede rychle.
 */
export function polohaJezdce(pozice: number): number {
  if (!Number.isFinite(pozice) || pozice <= 0) return 0;
  const x = (1 - Math.cos(Math.PI * pozice)) / 2;
  return Math.min(1, Math.max(0, x));
}

/** Kolikátá doba v taktu právě běží, od nuly. */
export function dobaVTaktu(pozice: number, dobVTaktu: number): number {
  if (!Number.isFinite(pozice) || pozice < 0 || dobVTaktu < 1) return 0;
  return Math.floor(pozice) % Math.floor(dobVTaktu);
}

/** Jaká část doby uplynula od posledního úderu (0 = právě teď). */
export function zaUderem(pozice: number): number {
  if (!Number.isFinite(pozice) || pozice < 0) return 0;
  return pozice - Math.floor(pozice);
}
