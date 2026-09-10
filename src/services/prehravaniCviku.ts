import { Tonu } from './cvikyTechnik';

/**
 * Krokování cviku při přehrávání.
 *
 * Vlastní přehrávání sedí v komponentě, protože sahá na zvuk a na
 * časovače. Rozhodování, který tón je na řadě a který má na hmatníku
 * svítit, je ale počítání — a to sem patří, aby se dalo ověřit testem.
 *
 * Původní verze si celý cvik naplánovala dopředu jedním `forEach`.
 * Na jedno přehrání to stačilo, na smyčku ne: počet kroků není předem
 * známý a plánovat nekonečně dopředu nejde.
 */

/**
 * Který tón je na řadě po tomhle. `-1` znamená konec.
 *
 * Ve smyčce se po posledním vrací na začátek, takže konec nenastane a
 * cvik jede, dokud ho někdo nezastaví.
 */
export function dalsiIndex(i: number, pocet: number, smycka: boolean): number {
  if (pocet <= 0) return -1;
  if (i + 1 < pocet) return i + 1;
  return smycka ? 0 : -1;
}

/**
 * Jak dlouho trvá jeden krok ve vteřinách.
 *
 * Tóny jdou po osminách: čtvrtka na dobu je na cvičení moc pomalá a
 * šestnáctky se při učení nedají sledovat očima. Tempo se dolů omezuje,
 * aby nula nebo záporné číslo z posuvníku nevyrobilo nekonečnou pauzu.
 */
export function delkaKroku(bpm: number): number {
  return 30 / Math.max(20, bpm);
}

/**
 * Svítí tenhle pražec zrovna teď?
 *
 * Tady byla chyba, kvůli které stupnice blikala jen cestou nahoru.
 * Hledalo se přes `findIndex`, tedy **první** výskyt daného pražce
 * v cviku — jenže sekvence „rovně" projde stupnici nahoru a stejné
 * pražce znovu dolů. Na zpáteční cestě se index přehrávaného tónu
 * (třeba 11) nikdy neshodoval s tím prvním nalezeným (3), takže
 * hmatník zhasl a zbytek cviku se hrál naslepo.
 *
 * Správně se nekouká, kde ten pražec v cviku leží, ale co se zrovna
 * hraje — a jestli je to on.
 */
export function jeHraneTeď(
  tony: Tonu[],
  ktery: number,
  struna: number,
  prazec: number,
): boolean {
  const ton = ktery >= 0 ? tony[ktery] : undefined;
  return !!ton && ton.struna === struna && ton.prazec === prazec;
}

/**
 * Kdy má znít další krok, v milisekundách.
 *
 * Počítá se z **cílového** času předchozího kroku, ne z toho, kdy
 * doopravdy zazněl. Časovač v prohlížeči se skoro vždycky opozdí o pár
 * milisekund a kdyby se přičítalo k „teď", ve smyčce by se ta zpoždění
 * sčítala a cvik by po pár minutách utekl metronomu o slyšitelný kus.
 *
 * Odvozovat cíl z čísla kroku (`zacatek + n * krok`) by drift vyřešilo
 * taky, ale rozbilo by změnu tempa za chodu: po stovce kroků v šedesáti
 * by přepnutí na sto dvacet přepočítalo celou uplynulou osu a zbytek
 * cviku by se vysypal naráz. Takhle se změna tempa projeví až na dalším
 * kroku, což je přesně to, co člověk u posuvníku čeká.
 */
export function dalsiCas(predchoziCil: number, bpm: number): number {
  return predchoziCil + delkaKroku(bpm) * 1000;
}
