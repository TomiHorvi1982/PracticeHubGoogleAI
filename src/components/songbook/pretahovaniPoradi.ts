/**
 * Přetahování položek v pořadí.
 *
 * Oddělené od komponent, protože obojí — knihovna i Pódium — má
 * fungovat stejně, a protože posun v poli je klasické místo na chybu
 * o jedničku: jakmile se položka vyjme, všechny za ní se posunou
 * a cíl už znamená něco jiného.
 *
 * Pracuje se s „místem vložení" (0 až n), ne s indexem položky:
 * ukazatel se kreslí mezi řádky, takže n položek má n+1 míst, kam se
 * dá pustit.
 */

/**
 * Do kterého místa se položka pustí, když myš zrovna visí nad položkou
 * `nadIndexem`.
 *
 * Rozhoduje polovina: nad horní půlkou se zařadí před ni, nad dolní za
 * ni. Bez toho by se na poslední položku nedalo zařadit za ni a seznam
 * by šlo skládat jen jedním směrem.
 */
export function mistoVlozeni(nadIndexem: number, druhaPulka: boolean): number {
  return Math.max(0, nadIndexem) + (druhaPulka ? 1 : 0);
}

/**
 * Znamenalo by puštění na tomhle místě vůbec nějakou změnu?
 *
 * Puštění těsně před sebe nebo těsně za sebe vrátí totéž pořadí —
 * ukazatel se tam proto nekreslí, aby nesliboval přesun, který se
 * nestane.
 */
export function meniPoradi(zIndexu: number, misto: number): boolean {
  return misto !== zIndexu && misto !== zIndexu + 1;
}

/**
 * Přepočítá místo vložení na index, jaký čeká `setListy.presun`.
 *
 * Ten nejdřív položku vyjme a teprve pak vloží, takže při posunu
 * dopředu je cíl o jedna nižší, než kam ukazuje čára.
 */
export function cilProPresun(zIndexu: number, misto: number): number {
  return misto > zIndexu ? misto - 1 : misto;
}

/**
 * Jak bude pořadí vypadat po puštění.
 *
 * Existuje kvůli testům: chování „čára mezi třetí a čtvrtou" se dá
 * ověřit na skutečném poli, ne jen na číslech.
 */
export function poPresunu<T>(pole: T[], zIndexu: number, misto: number): T[] {
  if (zIndexu < 0 || zIndexu >= pole.length) return pole;
  const kopie = [...pole];
  const [x] = kopie.splice(zIndexu, 1);
  kopie.splice(cilProPresun(zIndexu, misto), 0, x);
  return kopie;
}
