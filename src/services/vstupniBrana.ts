/**
 * Vstupní brána aplikace.
 *
 * Kdo není přihlášený, dostane jen vstupní stránku s přihlášením —
 * studio se mu nesestaví vůbec. Schovávat sekce po jedné by nestačilo:
 * do sekce vede víc cest a jedno opomenutí by zase ukázalo všechno.
 *
 * Data v databázi chrání politiky Supabase tak jako tak (nepřihlášený
 * dostane z tabulek nula řádků). Brána hlídá to, co politiky nepokryjí:
 * aby cizí člověk s odkazem neviděl, co aplikace umí a jak vypadá uvnitř.
 */

export type CoUkazat = 'cekani' | 'brana' | 'dovnitr';

export function coUkazat({ pripraveno, prihlasen }: { pripraveno: boolean; prihlasen: boolean }): CoUkazat {
  // Dřív než se obnoví uložené přihlášení, se neukáže nic — ani brána
  // (přihlášenému by probliklo přihlašování), ani studio.
  if (!pripraveno) return 'cekani';
  return prihlasen ? 'dovnitr' : 'brana';
}

/**
 * Přišel člověk přes odkaz pro žáky?
 *
 * `/zak` otevře stejnou bránu, jen rovnou na přihlášení přezdívkou
 * a PINem — dítě nemusí hledat správnou záložku.
 */
export function jeAdresaZaka(cesta: string): boolean {
  return /^\/zak\/?$/i.test(cesta || '');
}
