/**
 * Rozhodování o čase přehrávání.
 *
 * Dvě věci, na kterých se dá pohořet a které se špatně zkoušejí ručně:
 * co se má stát na konci skladby, a o kolik se rozladí zvuk puštěný
 * pomaleji. Obojí je proto tady, mimo audio engine.
 */

/**
 * Kde jsme a jestli je konec.
 *
 * Bez smyčky se počitadlo zastaví na konci — dřív se počítalo přes
 * zbytek po dělení, takže po dojetí skladby skočilo na začátek a běželo
 * dál, i když už bylo ticho. Se smyčkou se naopak zabalí dokola.
 */
export function dalsiCas(
  uplynulo: number,
  delka: number,
  dokola: boolean,
): { cas: number; konec: boolean } {
  if (!(delka > 0)) return { cas: 0, konec: false };
  if (uplynulo < 0) return { cas: 0, konec: false };
  if (dokola) return { cas: uplynulo % delka, konec: false };
  if (uplynulo >= delka) return { cas: delka, konec: true };
  return { cas: uplynulo, konec: false };
}

/**
 * O kolik půltónů posunout zpátky zvuk puštěný jinou rychlostí.
 *
 * Zpomalený vzorek zní hloub — dvojnásobná rychlost je přesně oktáva,
 * takže se to spočítá z dvojkového logaritmu. Bez toho by cvičení na
 * 0,75× hrálo o pět půltónů níž, než jak se skladba hraje.
 */
export function kompenzacePitche(rychlost: number): number {
  if (!(rychlost > 0)) return 0;
  const v = -12 * Math.log2(rychlost);
  // Při rychlosti 1 vyjde `-0`, které se od nuly liší striktním
  // porovnáním; ven má jít obyčejná nula.
  return v === 0 ? 0 : v;
}

/** Rychlosti, které jdou vybrat. */
export const RYCHLOSTI = [0.5, 0.75, 0.9, 1, 1.25, 1.5];
