/**
 * Skládání MIDI zpráv.
 *
 * Oddělené od prohlížeče schválně: bajty se dají splést tiše. Špatný
 * stavový bajt neshodí nic, jen Soundshed nezareaguje — a hledá se to
 * pak blbě. Na tohle jsou testy.
 *
 * Soundshed přijímá `CC`, `NoteOn` i `NoteOff` (viz jeho MIDI Learn),
 * na kanálech 1–16.
 */

/** Kanály se venku počítají od 1, v bajtech od 0. */
export const KANALU = 16;

export type DruhZpravy = 'cc' | 'note';

function omez(h: number, max: number): number {
  if (!Number.isFinite(h)) return 0;
  return Math.max(0, Math.min(max, Math.round(h)));
}

/** Kanál 1–16 na nibble 0–15. Mimo rozsah spadne na kanál 1. */
export function kanalNaNibble(kanal: number): number {
  const k = omez(kanal, KANALU);
  return k < 1 ? 0 : k - 1;
}

/** Control Change. */
export function zpravaCC(kanal: number, cislo: number, hodnota: number): number[] {
  return [0xb0 | kanalNaNibble(kanal), omez(cislo, 127), omez(hodnota, 127)];
}

/** Note On. Velocity 0 by se chovala jako Note Off, tak je aspoň 1. */
export function zpravaNoteOn(kanal: number, nota: number, velocity = 127): number[] {
  return [0x90 | kanalNaNibble(kanal), omez(nota, 127), Math.max(1, omez(velocity, 127))];
}

export function zpravaNoteOff(kanal: number, nota: number): number[] {
  return [0x80 | kanalNaNibble(kanal), omez(nota, 127), 0];
}

/**
 * Jedno „stisknutí" — dvojice zpráv, jak je čeká podlahový kontrolér.
 *
 * U CC se posílá 127 a hned 0. Kdyby zůstalo viset 127, chová se to
 * jako sešlápnutý a nepuštěný pedál: druhé stisknutí už není změna
 * a Soundshed na ně nereaguje.
 */
export function stisk(druh: DruhZpravy, kanal: number, cislo: number): number[][] {
  return druh === 'cc'
    ? [zpravaCC(kanal, cislo, 127), zpravaCC(kanal, cislo, 0)]
    : [zpravaNoteOn(kanal, cislo), zpravaNoteOff(kanal, cislo)];
}

/** Popisek do nápovědy, ať uživatel ví, co v Soundshedu učit. */
export function popisZpravy(druh: DruhZpravy, kanal: number, cislo: number): string {
  return druh === 'cc' ? `CC ${cislo}, kanál ${kanal}` : `nota ${cislo}, kanál ${kanal}`;
}
