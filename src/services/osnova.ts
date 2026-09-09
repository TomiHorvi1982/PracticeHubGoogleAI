/**
 * Osnova — tvar dat a pravidla, která z nich plynou.
 *
 * Bez databáze schválně, aby šla ověřit testem; čtení a zápis sedí
 * v `osnovaService.ts`.
 *
 * Názvy stupňů zůstávají v kódu, kdežto dovednosti a kritéria jsou data:
 * jména šesti stupňů se měnit nebudou, ale kritéria ano — vypadají skvěle,
 * dokud je nezkusíš na živém dítěti.
 */

export type DruhDovednosti = 'praxe' | 'teorie';
export type StavPostupu = 'nezacato' | 'cvici' | 'hotovo';

export interface Dovednost {
  id: string;
  stupen: number;
  poradi: number;
  druh: DruhDovednosti;
  nazev: string;
  kriterium: string;
}

export interface Postup {
  zak_id: string;
  dovednost_id: string;
  stav: StavPostupu;
  tempo: number | null;
  poznamka: string;
  zmeneno: string;
}

export const STUPNE: { cislo: number; nazev: string; doba: string }[] = [
  { cislo: 1, nazev: 'První tóny', doba: '0–3 měsíce' },
  { cislo: 2, nazev: 'Rytmus a přechody', doba: '3–8 měsíců' },
  { cislo: 3, nazev: 'Levá ruka samostatně', doba: '8–18 měsíců' },
  { cislo: 4, nazev: 'Frázování', doba: '1,5–2,5 roku' },
  { cislo: 5, nazev: 'Rytmická kytara naostro', doba: '2,5–4 roky' },
  { cislo: 6, nazev: 'Vlastní projev', doba: '4 roky a dál' },
];

export const NAZVY_POSTUPU: Record<StavPostupu, string> = {
  nezacato: 'nezačato',
  cvici: 'cvičí',
  hotovo: 'hotovo',
};

export function nazevStupne(cislo: number): string {
  return STUPNE.find((s) => s.cislo === cislo)?.nazev || `${cislo}. stupeň`;
}

/**
 * Stav dovednosti u konkrétního žáka.
 *
 * Chybějící řádek znamená, že se dovednost ještě nezačala — zakládat
 * prázdné řádky pro všech šestatřicet dovedností u každého žáka jen
 * proto, aby bylo do čeho psát, by databázi zaplnilo ničím.
 */
export function stavDovednosti(postup: Postup[], dovednostId: string): StavPostupu {
  return postup.find((p) => p.dovednost_id === dovednostId)?.stav || 'nezacato';
}

/**
 * Kolik ze stupně je hotovo, v procentech.
 *
 * Počítá se z celého stupně, ne jen z toho, co se začalo — jinak by dítě,
 * které rozdělalo jednu dovednost a dokončilo ji, mělo sto procent.
 */
export function hotovoZeStupne(dovednosti: Dovednost[], postup: Postup[], stupen: number): number {
  const ve = dovednosti.filter((d) => d.stupen === stupen);
  if (!ve.length) return 0;
  const hotovych = ve.filter((d) => stavDovednosti(postup, d.id) === 'hotovo').length;
  return Math.round((hotovych / ve.length) * 100);
}

/**
 * Na čem se má pokračovat.
 *
 * Nejdřív rozdělané, pak nezačaté v pořadí osnovy. Hotová se přeskočí.
 * Tohle je odpověď na otázku, kterou si učitel klade minutu před hodinou.
 */
export function coDal(dovednosti: Dovednost[], postup: Postup[], stupen: number): Dovednost[] {
  const ve = dovednosti
    .filter((d) => d.stupen === stupen)
    .sort((a, b) => a.poradi - b.poradi);
  const vaha = (d: Dovednost) => {
    const s = stavDovednosti(postup, d.id);
    return s === 'cvici' ? 0 : s === 'nezacato' ? 1 : 2;
  };
  return ve.filter((d) => vaha(d) < 2).sort((a, b) => vaha(a) - vaha(b) || a.poradi - b.poradi);
}

/**
 * Je stupeň hotový celý?
 *
 * Podle toho se pozná, kdy dítě posunout dál — a kdy mu dát sto bodů.
 */
export function stupenHotovy(dovednosti: Dovednost[], postup: Postup[], stupen: number): boolean {
  const ve = dovednosti.filter((d) => d.stupen === stupen);
  return ve.length > 0 && ve.every((d) => stavDovednosti(postup, d.id) === 'hotovo');
}
