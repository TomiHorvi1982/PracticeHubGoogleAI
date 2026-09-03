/**
 * Stará označení nástrojů a jejich dnešní protějšky.
 *
 * V kódu se na deseti místech hraje přes `acoustic_guitar` a
 * `electric_guitar`, jenže taková id v katalogu nikdy nebyla. Vyhledání
 * je nenašlo a tiše spadlo na křídlo — takže ladička, MIDI přehrávač,
 * akordy i hmatník léta hrály klavír místo kytary, aniž by se kde
 * objevila chyba.
 *
 * Opravovat to u každého volajícího zvlášť by znamenalo deset míst
 * a jedenácté by se zapomnělo. Překládá se proto při vyhledání.
 */

export const ALIASY_NASTROJU: Record<string, string> = {
  acoustic_guitar: 'acoustic_dreadnought',
  electric_guitar: 'electric_strat_clean',
  // Basa má tentýž problém z téže doby.
  bass_guitar: 'acoustic_bass_guitar',
};

/**
 * Skutečné id nástroje.
 *
 * Co v překladu není, projde beze změny — nové názvy se tudy jen
 * mihnou a katalog si je dohledá sám.
 */
export function skutecneId(profil: string): string {
  return ALIASY_NASTROJU[profil] || profil;
}
