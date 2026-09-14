/**
 * Pohyb ručičky ladičky a klid na displeji.
 *
 * Detekce hlásí výsledek při každém překreslení obrazovky, tedy asi
 * šedesátkrát za vteřinu, a mezi doznívajícími tóny několikrát za vteřinu
 * hlásí ticho. Kdyby se podle toho ručička nastavovala napřímo, poskakuje
 * — kytarový tón se v centech chvěje i při dokonale naladěné struně.
 *
 * Tady je počítání, které z toho udělá klidný pohyb. Je schválně bez
 * Reactu i bez plátna: ručičkou se hýbe mimo překreslování Reactu, protože
 * překreslovat kvůli ní celou sekci šedesátkrát za vteřinu je to, co
 * působí trhaně.
 */

import type { PitchData } from './tuner';

/** Meze stupnice v centech. Půltón je sto centů, tohle je tedy půl půltónu na každou stranu. */
export const ROZSAH_CENTU = 50;

/**
 * Kam ručička ukazuje. Nula je svisle vzhůru, kladné doprava.
 *
 * Kraje stupnice leží vodorovně, takže půlkruh přesně pokryje ±50 centů.
 */
export function uhelZCentu(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  const v = Math.max(-ROZSAH_CENTU, Math.min(ROZSAH_CENTU, cents));
  return (v / ROZSAH_CENTU) * 90;
}

/** Pod tímhle rozdílem už se ručička považuje za doraženou. */
const DORAZ_STUPNU = 0.01;

/**
 * Další poloha ručičky na cestě k cíli.
 *
 * Exponenciální přibližování: každou chvilku ubere stejný **podíl**
 * zbývajícího rozdílu, takže velký skok začne svižně a doklouže pomalu.
 * Počítá se z uplynulého času, ne z počtu snímků — jinak by na pomalém
 * stroji jela ručička jinou rychlostí než na rychlém.
 *
 * `casovaKonstanta` je v milisekundách: za tu dobu ručička ujede zhruba
 * dvě třetiny rozdílu. Čím vyšší, tím klidnější a línější pohyb.
 */
export function dalsiUhel(
  { soucasny, cil, dtMs, casovaKonstanta }:
  { soucasny: number; cil: number; dtMs: number; casovaKonstanta: number },
): number {
  if (dtMs <= 0) return soucasny;
  if (Math.abs(cil - soucasny) <= DORAZ_STUPNU) return cil;
  const podil = 1 - Math.exp(-dtMs / casovaKonstanta);
  const dalsi = soucasny + (cil - soucasny) * podil;
  return Math.abs(cil - dalsi) <= DORAZ_STUPNU ? cil : dalsi;
}

/**
 * Který tón se má ukazovat, když detekce zrovna mlčí.
 *
 * Poslední tón se chvíli podrží. Bez toho displej při každé tiché chvilce
 * přeskočí na výzvu „zahrajte tón", a protože ta je jinak vysoká, poskočí
 * s ní celá stránka.
 */
export function drzenyTon(
  { posledni, kdy, ted, drzetMs }:
  { posledni: PitchData | null; kdy: number; ted: number; drzetMs: number },
): PitchData | null {
  if (!posledni) return null;
  return ted - kdy <= drzetMs ? posledni : null;
}

/**
 * Bod na oblouku budíku.
 *
 * Úhel se počítá stejně jako u ručičky: nula míří vzhůru, kladné doprava.
 * Slouží ke kreslení rysek a pásem, aby seděly přesně tam, kam ručička
 * ukazuje.
 */
export function bodNaOblouku(cx: number, cy: number, r: number, uhel: number): { x: number; y: number } {
  const rad = ((uhel - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Cesta pro oblouk mezi dvěma úhly. Vždy kratší cestou, protože pásma
 * budíku nikdy nepřesáhnou půlkruh.
 */
export function oblouk(cx: number, cy: number, r: number, od: number, doUhel: number): string {
  const a = bodNaOblouku(cx, cy, r, od);
  const b = bodNaOblouku(cx, cy, r, doUhel);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}
