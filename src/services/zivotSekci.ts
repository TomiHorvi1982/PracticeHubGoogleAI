/**
 * Které sekce zůstávají naživu.
 *
 * Dosud se vykreslovala jen ta jedna, na kterou ses zrovna díval.
 * Přepnutí tu předchozí odmontovalo a s ní zmizel i její stav — načtené
 * stopy, rozepsaná tabulatura, naťukaný cvik, rozdělaný mix. Vracet se
 * do sekce znamenalo začínat znovu.
 *
 * Sekce proto zůstávají připojené: jednou navštívená se už neodmontuje,
 * jen se schová. React jí tím nechá stav i všechno, co si drží v paměti.
 *
 * Nepřipojují se dopředu všechny. Start aplikace by se protáhl o věci,
 * které ten člověk třeba vůbec neotevře — a některé sekce si při
 * připojení sahají do databáze nebo staví zvukový řetěz.
 *
 * Nic se nezahazuje ani po čase. Uvolnit nejstarší sekci by ušetřilo
 * paměť, ale přesně tím způsobem, kterému se tohle celé snaží zabránit:
 * člověk by se vrátil a našel prázdno. Cenou je, že paměť roste s počtem
 * otevřených sekcí.
 */

/**
 * Zdroje zvuku, které přepnutí sekce nezastaví.
 *
 * Spodní lišta přehrávače je schválně nad sekcemi — má hrát dál, když
 * si člověk odskočí jinam. Ostatní zdroje patří ke své sekci a mají
 * zmlknout, jakmile ji není vidět; jinak by po pár přepnutích hrálo
 * všechno naráz.
 */
export const ZDROJE_NAD_SEKCEMI = ['global-player'];

/**
 * Přidá sekci mezi živé.
 *
 * Pořadí se drží podle prvního otevření a nemění se — seznam určuje
 * pořadí prvků ve stromu a přeskládání by React donutilo komponenty
 * odmontovat a postavit znovu, čímž by o stav přišly.
 *
 * Vrací tentýž seznam, když se nic nemění, aby React zbytečně
 * nepřekresloval.
 */
export function pridejZivou<T>(zive: readonly T[], sekce: T): readonly T[] {
  return zive.includes(sekce) ? zive : [...zive, sekce];
}

/**
 * Je tahle sekce ta, na kterou se člověk dívá?
 *
 * Ostatní zůstávají ve stromu, ale schované — a nemají kreslit ani hrát.
 */
export function jeVidet<T>(sekce: T, aktivni: T): boolean {
  return sekce === aktivni;
}
