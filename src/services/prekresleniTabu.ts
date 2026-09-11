/**
 * Kdy tabulaturu překreslit.
 *
 * AlphaTab rozvrhne noty podle šířky kontejneru v okamžiku vykreslení.
 * Sekce ale zůstávají po přepnutí připojené a jen se schovávají
 * (`display: none`), takže soubor otevřený „naslepo" — z jiné sekce nebo
 * hlasovým příkazem — se rozvrhne do šířky nula. Po zobrazení se AlphaTab
 * sám nevzpamatuje: plocha zůstane prázdná a nikde není chyba.
 *
 * Překresluje se proto jen jako oprava tohohle stavu, ne pokaždé, když se
 * sekce ukáže. Vykreslení velké tabulatury trvá vteřiny a při každém
 * návratu do sekce by to bylo znát.
 */
export interface StavKresleni {
  /** Šířka kontejneru teď. Nula znamená schovaná sekce. */
  sirka: number;
  /** Je vůbec co kreslit? */
  maSkore: boolean;
  /** Poslední vykreslení proběhlo do nulové šířky, tedy naslepo. */
  kresleno0Sirkou: boolean;
}

export function maSePrekreslit({ sirka, maSkore, kresleno0Sirkou }: StavKresleni): boolean {
  return sirka > 0 && maSkore && kresleno0Sirkou;
}
