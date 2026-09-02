/**
 * Výběr zvukových souborů pro skládačku.
 *
 * Knihovna má přes osmnáct tisíc položek, ale z toho je šestnáct tisíc
 * MIDI — na skládání skladby ze zvuků jsou k ničemu. Skutečně
 * přehratelných je něco přes dva tisíce a právě ty sem patří.
 *
 * Rozhodování je tady zvlášť od serveru, protože se v něm dá tiše
 * splést: špatný filtr nevrátí chybu, jen míň souborů — a přesně tak
 * zůstalo 95 % knihovny nedostupných.
 */

/**
 * Co je opravdu vzorek k poslechu.
 *
 * Podle přípony v MIME, ne podle kategorie: kategorie mají díry
 * (bass_sample, guitar_sample i vocal_sample jsou prázdné) a nová
 * kategorie by se do seznamu musela dopisovat ručně.
 */
export const ZVUKOVE_MIME = ['audio/wav', 'audio/mpeg'];

/** Kolik položek se vydá najednou, když si volající neřekne jinak. */
export const NA_STRANU = 200;
/** Strop na jeden dotaz — proti „dej mi všech dva tisíce naráz". */
export const NEJVIC = 500;

/**
 * Kategorie pro záložky nástrojů.
 *
 * `bicí` schválně jen smyčky: jednotlivých ran je patnáctkrát víc, takže
 * by seznam zaplnily a smyčky by se v něm ztratily — a kopák sám o sobě
 * není, z čeho poskládat část skladby. Od toho jsou pady v sekci Bicí.
 */
export const NASTROJ_KATEGORIE: Record<string, string[]> = {
  bicí: ['drum_loop'],
  basa: ['bass_sample'],
  kytara: ['guitar_sample'],
  vokal: ['vocal_sample'],
  stopy: ['stem_mix'],
};

/** Zvláštní hodnota: neomezovat se na kategorii, dát celou knihovnu. */
export const VSE = 'vse';

/**
 * Podle čeho filtrovat kategorie, nebo `null` pro všechno.
 *
 * Přednost má výslovná kategorie z adresy — bez ní se nedalo dostat
 * k `drum_kit_sample`, kterých je v knihovně nejvíc.
 */
export function kategorieVyberu(
  nastroj: string | undefined,
  kategorie: string | undefined,
): string[] | null {
  const k = (kategorie || '').trim();
  if (k === VSE) return null;
  if (k) return [k];

  const n = (nastroj || '').trim();
  if (n === VSE) return null;
  return NASTROJ_KATEGORIE[n] || NASTROJ_KATEGORIE['bicí'];
}

/**
 * Meze stránky.
 *
 * Záporný začátek i nesmyslná velikost chodí z adresy, takže se ořezávají
 * tady, ne až v databázi — `range(-5, 1e9)` vrátí chybu, ne prázdno.
 */
export function strankovani(
  od: unknown,
  limit: unknown,
): { od: number; limit: number; do: number } {
  const o = Math.max(0, Math.floor(Number(od)) || 0);
  const l = Math.max(1, Math.min(NEJVIC, Math.floor(Number(limit)) || NA_STRANU));
  return { od: o, limit: l, do: o + l - 1 };
}

/** Escapuje `%` a `_`, aby hledaný text nefungoval jako žolík. */
export function vzorHledani(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
