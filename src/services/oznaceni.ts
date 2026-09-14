/**
 * Označování zbytečných textů přímo v běžící aplikaci.
 *
 * Jen pro vývoj u sebe: klikne se na nadpis nebo popisek, který v aplikaci
 * nemá být, a seznam se uloží do souboru, podle kterého se texty z kódu
 * odstraní. Popsat slovy „ten šedý nápis vedle set listu" je pomalé
 * a nepřesné; kliknout na něj ne.
 */

export interface Oznaceni {
  /** Viditelný text prvku — podle něj se v kódu dohledá. */
  text: string;
  /** Ve které sekci byl, aby se stejný text jinde nesmazal omylem. */
  sekce: string;
  /** Značka prvku, třeba `h3` nebo `span`. */
  prvek: string;
  kdy: number;
}

const MAX_TEXTU = 200;

export function zkratText(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTU);
}

/** Klik označí, druhý klik na totéž označení zruší. */
export function prepni(seznam: readonly Oznaceni[], nove: Oznaceni): Oznaceni[] {
  const stejne = (o: Oznaceni) => o.text === nove.text && o.sekce === nove.sekce;
  return seznam.some(stejne) ? seznam.filter((o) => !stejne(o)) : [...seznam, nove];
}

/**
 * Přišel zápis z tohohle počítače?
 *
 * Vývojový server poslouchá na všech rozhraních, takže by jinak mohl
 * zapisovat kdokoli ze stejné wifi.
 */
export function jeZeStroje(adresa: string | undefined): boolean {
  return adresa === '127.0.0.1' || adresa === '::1' || adresa === '::ffff:127.0.0.1';
}
