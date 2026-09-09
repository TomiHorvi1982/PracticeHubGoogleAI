/**
 * Domácí úkoly — tvar dat a pravidla, která z nich plynou.
 *
 * Bez databáze schválně. Sousední `ukolyService.ts` sahá na Supabase,
 * který se v testovacím běhu Node nedá načíst; kdyby bylo obojí
 * v jednom souboru, přestaly by jít testy spustit. Jednou se to už
 * stalo u cviků, podruhé to opakovat nemusím.
 */

export type DruhUkolu = 'cvik' | 'pisen' | 'material' | 'text';
export type StavUkolu = 'zadano' | 'odevzdano' | 'hotovo';

export interface Ukol {
  id: string;
  zak_id: string;
  ucitel_uid: string;
  druh: DruhUkolu;
  cil_id: string | null;
  zadani: string;
  do_kdy: string | null;
  cilove_tempo: number | null;
  stav: StavUkolu;
  odevzdano_kdy: string | null;
  zpetna_vazba: string;
  created_at: string;
}

export const NAZVY_STAVU: Record<StavUkolu, string> = {
  zadano: 'zadáno',
  odevzdano: 'odevzdáno',
  hotovo: 'hotovo',
};

/**
 * Je úkol po termínu?
 *
 * Počítá se na dny, ne na hodiny: úkol „do neděle" je splněný i v neděli
 * večer a rozsvítit ho jako opožděný v neděli ráno by bylo nefér.
 */
export function poTerminu(u: Ukol, dnes = new Date()): boolean {
  if (!u.do_kdy || u.stav === 'hotovo') return false;
  const den = new Date(`${u.do_kdy}T23:59:59`);
  return den.getTime() < dnes.getTime();
}

/**
 * Pořadí úkolů pro dítě.
 *
 * Nahoře, co je potřeba udělat, dole hotové. Uvnitř podle termínu —
 * nejbližší první, úkoly bez termínu až za nimi, protože „někdy" počká.
 */
export function seradProZaka(ukoly: Ukol[]): Ukol[] {
  const vaha = (u: Ukol) => (u.stav === 'hotovo' ? 2 : u.stav === 'odevzdano' ? 1 : 0);
  return [...ukoly].sort((a, b) => {
    if (vaha(a) !== vaha(b)) return vaha(a) - vaha(b);
    if (!a.do_kdy && !b.do_kdy) return a.created_at.localeCompare(b.created_at);
    if (!a.do_kdy) return 1;
    if (!b.do_kdy) return -1;
    return a.do_kdy.localeCompare(b.do_kdy);
  });
}
