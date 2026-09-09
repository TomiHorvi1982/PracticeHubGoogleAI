import { ALL_INSTRUMENTS } from '../data/instrumentPresets';

/**
 * Kytary ze zvukové banky.
 *
 * Cvičení na hmatníku znělo klavírem. Ne omylem v nastavení — v kódu
 * stálo `acoustic_guitar_steel`, což je jméno soundfontu, ne id nástroje
 * v katalogu. Neznámé id se tiše nahradí klavírem, takže na to nikdo
 * nepřišel.
 *
 * Tenhle modul proto id nevypisuje, ale bere je z katalogu. Co v něm
 * není, se sem nedostane — a test to hlídá, aby se táž chyba nedala
 * napsat znovu.
 */

export interface KytarovyZvuk {
  id: string;
  nazev: string;
}

/** Kategorie, ve které banka drží kytary a drnkací nástroje. */
const KATEGORIE = 'guitars_plucked';

/**
 * Co se nabídne první.
 *
 * Na cvičení stupnic chce většina lidí čistý zvuk, na kterém je slyšet
 * každý tón. Zkreslená kytara jednotlivé tóny slévá a mandolína s banjem
 * jsou sice ve stejné kategorii, ale hmatník mají jiný.
 */
const NAPRED = [
  'acoustic_dreadnought',
  'electric_strat_clean',
  'nylon_classical_spanish',
  'electric_tele_twang',
  'jazz_hollowbody',
];

export const VYCHOZI_KYTARA = 'acoustic_dreadnought';

export function kytaroveZvuky(): KytarovyZvuk[] {
  const vse = ALL_INSTRUMENTS
    .filter((i: any) => i.category === KATEGORIE && i.soundfont)
    .map((i: any) => ({ id: String(i.id), nazev: String(i.name || i.id) }));

  const poradi = (id: string) => {
    const i = NAPRED.indexOf(id);
    return i < 0 ? NAPRED.length : i;
  };
  return vse.sort((a, b) => poradi(a.id) - poradi(b.id));
}

/** Zní tohle id vůbec? Neznámé by se přehrálo jako klavír. */
export function jeKytara(id: string): boolean {
  return kytaroveZvuky().some((z) => z.id === id);
}
